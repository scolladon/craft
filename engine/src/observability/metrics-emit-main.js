/**
 * metrics-emit: append one per-phase metrics ledger row, read from the
 * current session's Claude transcripts.
 *
 * This is a SECOND composition root alongside usage-mine-main.js (see the
 * two-entry COMPOSITION_ROOT_FILES set in test/architecture-boundaries.test.js)
 * — a role this bin cannot discharge without importing the Claude discovery,
 * telemetry, and cache-split adapters directly. Routing those imports through
 * usage-mine-main.js instead would couple this bin to that one's composition
 * (its --source table, its report-writing shape) for no benefit; declaring a
 * second root is the honest boundary. Three helpers are imported from that
 * module — `resolveDefaultTranscriptDir`, `makeDiscoveryPorts` and
 * `streamTranscriptFiles`. None is composition: each takes every port it uses
 * as a parameter, so importing them shares the streaming contract (including
 * its failed/refused counters) instead of forking a second copy that drifts.
 *
 * Two containment roots (fail-closed):
 *   READ  root — the Claude projects root; the resolved transcript dir must
 *     be inside it.
 *   WRITE root — the repo root; the resolved ledger path must be inside it.
 *
 * Exit discipline is the miner's, INVERTED for containment. usage-mine treats
 * an out-of-bounds --dir as an advisory no-op because it runs unattended and
 * must never fail a caller's script. metrics-emit is invoked by name with an
 * explicit --run, so a caller who typed a --dir or --ledger that escapes its
 * root almost certainly meant something else — that is a config error (exit
 * 1, one targeted stderr line naming the flag), not a silent no-op. The other
 * three advisory-exit-0 paths (absent transcript dir, unreadable sidecar,
 * zero events) are unchanged from the miner's posture: each names a real,
 * expected steady state (a phase that has not run yet, an unlabelled spawn)
 * rather than a caller mistake.
 *
 * Only sub-agent transcripts are parsed. A main-loop transcript yields no
 * event here twice over — `parseLines` bails on `includeInline: false`, and a
 * main-loop event carries `phase: null` and is filtered out downstream — so
 * narrowing before the parse makes the one-row-per-agent-spawned-phase
 * contract structural rather than incidental, and drops the realpath chain and
 * full stream-parse each discarded entry would otherwise cost.
 *
 * Grouping: one parse of the discovered transcripts, then a group-by on the
 * `phase` the claude adapter already stamped from each sidecar's agentType.
 * `--phase` narrows the emitted row to that one phase (an empty slice still
 * renders, as `transcript=na` — a phase whose transcript cannot be found is
 * an outcome, never nothing); omitting it emits one row per distinct phase
 * the parse actually found. `--since` is not decoration: one session
 * directory can hold two spawns of the same phase, and without a lower bound
 * the second row would re-count the first's events instead of describing
 * only what ran after it.
 */

import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import {
  readFileSync as nodeReadFileSync,
  writeFileSync as nodeWriteFileSync,
  createReadStream as nodeCreateReadStream,
  readdirSync as nodeReaddirSync,
  mkdirSync as nodeMkdirSync,
} from 'node:fs';
import { createInterface as nodeCreateInterface } from 'node:readline';
import { containByRealpath as nodeContainByRealpath } from '../contain.js';
import { discover } from './adapters/claude/discovery.js';
import { parseLines, CACHE_READ_FIELD, CACHE_CREATION_FIELD } from './adapters/claude/telemetry.js';
import { formatCacheSplit } from './adapters/claude/metrics-split.js';
import { formatMetricsRow, LEDGER_HEADER } from './metrics-line.js';
import {
  resolveDefaultTranscriptDir,
  makeDiscoveryPorts,
  streamTranscriptFiles,
} from './usage-mine-main.js';

const EXIT_OK = 0;
// The four config errors below are the only non-zero exits — every other
// path (absent dir, unreadable sidecar, zero events) stays advisory.
const EXIT_CONFIG_ERROR = 1;
const CLAUDE_SOURCE = 'claude';
const DEFAULT_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const DEFAULT_LEDGER_RELPATH = join('.claude', 'craft-metrics.md');
// --run and --phase are the only caller-supplied strings that reach the
// committed ledger. The run-id originates in a free-text brief and is relayed
// onto a command line, so an unchecked newline in either would append forged
// rows to an append-only artifact that later feeds cost decisions. Shape is
// checked at the front door, never in the pure formatter.
const ROW_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SUBAGENT_SOURCE_KIND = 'subagent';

function parseArgs(argv) {
  const parsed = { run: null, phase: null, session: null, dir: null, since: null, ledger: null };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--run': parsed.run = argv[++i] ?? null; break;
      case '--phase': parsed.phase = argv[++i] ?? null; break;
      case '--session': parsed.session = argv[++i] ?? null; break;
      case '--dir': parsed.dir = argv[++i] ?? null; break;
      case '--since': parsed.since = argv[++i] ?? null; break;
      case '--ledger': parsed.ledger = argv[++i] ?? null; break;
    }
  }
  return parsed;
}

function sessionFilter(sessionId) {
  return sessionId ? (entry) => entry.relPath.startsWith(`${sessionId}/`) : () => true;
}

function groupByPhase(events) {
  const groups = new Map();
  for (const event of events) {
    const group = groups.get(event.phase) ?? [];
    group.push(event);
    groups.set(event.phase, group);
  }
  return groups;
}

// Given { cacheRead, cacheCreation } (the ledger's vendor-neutral shape) or
// null (the split is unavailable for this slice), re-key it under the claude
// adapter's own raw field names and let formatCacheSplit render its own
// degradation — never re-implemented here.
function renderCacheSplit(sums) {
  return formatCacheSplit(sums && { [CACHE_READ_FIELD]: sums.cacheRead, [CACHE_CREATION_FIELD]: sums.cacheCreation });
}

function buildRows(runId, requestedPhase, phasedEvents) {
  if (requestedPhase) {
    const slice = phasedEvents.filter((event) => event.phase === requestedPhase);
    return [formatMetricsRow(runId, requestedPhase, slice, renderCacheSplit)];
  }
  const groups = groupByPhase(phasedEvents);
  return [...groups.keys()].sort()
    .map((phase) => formatMetricsRow(runId, phase, groups.get(phase), renderCacheSplit));
}

// The four config errors, resolved together: each returns before any I/O
// runs, and the two containment checks reuse the same shape so main() never
// has to know which check produced the message it forwards to stderr.
function resolveConfig(parsed, { projectsRoot, repoRoot, cwd, containByRealpath }) {
  if (!parsed.run) return { ok: false, message: 'metrics-emit: missing required --run\n' };
  if (!ROW_TOKEN.test(parsed.run)) {
    return { ok: false, message: `metrics-emit: invalid --run '${parsed.run}'\n` };
  }
  if (parsed.phase !== null && !ROW_TOKEN.test(parsed.phase)) {
    return { ok: false, message: `metrics-emit: invalid --phase '${parsed.phase}'\n` };
  }
  if (parsed.since !== null && !Number.isFinite(Date.parse(parsed.since))) {
    return { ok: false, message: `metrics-emit: unparseable --since '${parsed.since}'\n` };
  }
  const defaultDir = resolveDefaultTranscriptDir(CLAUDE_SOURCE, projectsRoot, cwd);
  const transcriptDir = containByRealpath(projectsRoot, parsed.dir ? resolve(parsed.dir) : defaultDir);
  if (!transcriptDir) return { ok: false, message: 'metrics-emit: --dir not contained within the projects root\n' };
  const defaultLedger = join(repoRoot, DEFAULT_LEDGER_RELPATH);
  const ledgerPath = containByRealpath(repoRoot, parsed.ledger ? resolve(parsed.ledger) : defaultLedger);
  if (!ledgerPath) return { ok: false, message: 'metrics-emit: --ledger not contained within the repo root\n' };
  return { ok: true, transcriptDir, ledgerPath };
}

// Only a genuinely absent file may be treated as "start a new ledger". Any
// other read failure leaves the prior content unknown, and writing then
// would replace an append-only artifact with header-plus-new-rows,
// destroying every historical row. Refuse the write instead.
function readExistingLedger(ledgerPath, readFileSync, stderr) {
  try {
    return { ok: true, existing: readFileSync(ledgerPath, 'utf8'), absent: false };
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: true, existing: '', absent: true };
    stderr.write(`metrics-emit: ledger read failed (${e.code ?? 'unknown'}), refusing to write\n`);
    // `{ ok: false }` and nothing else: a refusal that also carried an
    // `existing: ''` would be indistinguishable from a legitimately empty
    // ledger, so a caller that forgot the check would write header-plus-rows
    // over the history. Same shape resolveConfig uses, for the same reason.
    return { ok: false };
  }
}

// Append (`>>` semantics: read-if-exists, concat, write), printing every
// appended row to stdout so the caller needs no second read. A failed write
// is advisory: one stderr line, exit 0 (the caller already returns EXIT_OK).
function appendLedgerRows(ledgerPath, rows, { readFileSync, writeFileSync, mkdirSync, stdout, stderr }) {
  const read = readExistingLedger(ledgerPath, readFileSync, stderr);
  if (!read.ok) return;
  const { existing, absent } = read;
  const body = rows.map((row) => `${row}\n`).join('');
  try {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, existing + (absent ? LEDGER_HEADER : '') + body, 'utf8');
  } catch (e) {
    stderr.write(`metrics-emit: ledger write failed (${e.code ?? 'unknown'})\n`);
    return;
  }
  for (const row of rows) stdout.write(`${row}\n`);
}

// Resolved once per invocation so `process.cwd()` is sampled a single time —
// two calls could straddle a chdir and root the read and the write differently.
function resolveDeps(io) {
  const {
    stdout,
    stderr,
    readFileSync = nodeReadFileSync,
    writeFileSync = nodeWriteFileSync,
    mkdirSync = nodeMkdirSync,
    createReadStream = nodeCreateReadStream,
    createInterface = nodeCreateInterface,
    readdirSync = nodeReaddirSync,
    containByRealpath = nodeContainByRealpath,
    projectsRoot = DEFAULT_PROJECTS_DIR,
    repoRoot = process.cwd(),
    cwd = process.cwd(),
  } = io;
  return {
    stdout, stderr, readFileSync, writeFileSync, mkdirSync, createReadStream,
    createInterface, readdirSync, containByRealpath, projectsRoot, repoRoot, cwd,
  };
}

// Returns phase-labelled events only. The unlabelled ones are not an error
// worth failing on: a spawn whose sidecar is missing or malformed is an
// expected steady state, and dropping it here keeps one row per phase.
async function collectPhasedEvents(parsed, transcriptDir, deps) {
  const { readdirSync, readFileSync, containByRealpath, createReadStream, createInterface, stderr } = deps;
  const { entries } = discover(makeDiscoveryPorts(transcriptDir, { readdirSync, readFileSync, containByRealpath }));
  const scoped = entries
    .filter((entry) => entry.context?.sourceKind === SUBAGENT_SOURCE_KIND)
    .filter(sessionFilter(parsed.session));
  const { events, failed, refused } = await streamTranscriptFiles(
    scoped, transcriptDir, createReadStream, createInterface, containByRealpath, parseLines, parsed.since, false,
  );
  if (failed > 0 || refused > 0) {
    stderr.write(`metrics-emit: ${failed} transcript(s) unreadable, ${refused} refused by containment\n`);
  }
  return events.filter((event) => event.phase !== null);
}

/**
 * @param {string[]} argv
 * @param {{ stdout: {write(s:string):void}, stderr: {write(s:string):void},
 *   readFileSync?: Function, writeFileSync?: Function, mkdirSync?: Function,
 *   createReadStream?: Function, createInterface?: Function,
 *   readdirSync?: Function, containByRealpath?: Function,
 *   projectsRoot?: string, repoRoot?: string, cwd?: string }} io
 * @returns {Promise<number>} 0 on every advisory path; 1 for the four config
 *   errors caught before any I/O (missing --run, unparseable --since, an
 *   out-of-bounds --dir or --ledger).
 */
export async function main(argv, io) {
  const deps = resolveDeps(io);
  const { stderr } = deps;
  const parsed = parseArgs(argv);

  const config = resolveConfig(parsed, deps);
  if (!config.ok) {
    stderr.write(config.message);
    return EXIT_CONFIG_ERROR;
  }

  const phasedEvents = await collectPhasedEvents(parsed, config.transcriptDir, deps);
  const rows = buildRows(parsed.run, parsed.phase, phasedEvents);
  if (rows.length === 0) {
    stderr.write(`metrics-emit: no events found for run '${parsed.run}'\n`);
    return EXIT_OK;
  }

  appendLedgerRows(config.ledgerPath, rows, deps);
  return EXIT_OK;
}
