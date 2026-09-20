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
 * second root is the honest boundary. Only `resolveDefaultTranscriptDir` is
 * imported from that module — a pure unit-test seam, not its composition.
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
import { resolveDefaultTranscriptDir } from './usage-mine-main.js';

const EXIT_OK = 0;
// The four config errors below are the only non-zero exits — every other
// path (absent dir, unreadable sidecar, zero events) stays advisory.
const EXIT_CONFIG_ERROR = 1;
const CLAUDE_SOURCE = 'claude';
const DEFAULT_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const DEFAULT_LEDGER_RELPATH = join('.claude', 'craft-metrics.md');

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

// Mirrors usage-mine-main.js's own discovery-port adapter — duplicated
// rather than imported, since this root imports nothing from that module
// beyond the one named unit-test seam (see the module header).
function makeDiscoveryPorts(readRoot, { readdirSync, readFileSync, containByRealpath }) {
  const safe = (relPath) => containByRealpath(readRoot, join(readRoot, relPath));
  return {
    listDir(relPath) {
      const p = safe(relPath);
      if (!p) return null;
      try { return readdirSync(p); } catch { return null; }
    },
    readText(relPath) {
      const p = safe(relPath);
      if (!p) return null;
      try { return readFileSync(p, 'utf8'); } catch { return null; }
    },
  };
}

function sessionFilter(sessionId) {
  return sessionId ? (entry) => entry.relPath.startsWith(`${sessionId}/`) : () => true;
}

// One UsageEvent per emitted transcript line, streamed (never readFileSync)
// — same rationale as usage-mine-main.js's own streaming loop. A transcript
// that fails to open or parse is skipped rather than aborting the run: one
// bad spawn must not blank out every other phase's row.
async function collectEvents(entries, transcriptDir, ports, since) {
  const { createReadStream, createInterface, containByRealpath } = ports;
  const events = [];
  for (const [spawnId, entry] of entries.entries()) {
    const safeFile = containByRealpath(transcriptDir, join(transcriptDir, entry.relPath));
    if (!safeFile) continue;
    try {
      const stream = createReadStream(safeFile);
      const lines = createInterface({ input: stream, crlfDelay: Infinity });
      const context = { ...(entry.context ?? {}), includeInline: false, spawnId };
      const { events: parsed } = await parseLines(lines, since, context);
      for (const event of parsed) events.push(event);
    } catch {
      continue;
    }
  }
  return events;
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

// Append (`>>` semantics: read-if-exists, concat, write), printing every
// appended row to stdout so the caller needs no second read. A failed write
// is advisory: one stderr line, exit 0 (the caller already returns EXIT_OK).
function appendLedgerRows(ledgerPath, rows, { readFileSync, writeFileSync, mkdirSync, stdout, stderr }) {
  let existing = '';
  let absent = false;
  try {
    existing = readFileSync(ledgerPath, 'utf8');
  } catch {
    absent = true;
  }
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

  const parsed = parseArgs(argv);
  const config = resolveConfig(parsed, { projectsRoot, repoRoot, cwd, containByRealpath });
  if (!config.ok) {
    stderr.write(config.message);
    return EXIT_CONFIG_ERROR;
  }
  const { transcriptDir, ledgerPath } = config;

  const { entries } = discover(makeDiscoveryPorts(transcriptDir, { readdirSync, readFileSync, containByRealpath }));
  const scoped = entries.filter(sessionFilter(parsed.session));
  const events = await collectEvents(scoped, transcriptDir, { createReadStream, createInterface, containByRealpath }, parsed.since);
  const phasedEvents = events.filter((event) => event.phase !== null);

  const rows = buildRows(parsed.run, parsed.phase, phasedEvents);
  if (rows.length === 0) {
    stderr.write(`metrics-emit: no events found for run '${parsed.run}'\n`);
    return EXIT_OK;
  }

  appendLedgerRows(ledgerPath, rows, { readFileSync, writeFileSync, mkdirSync, stdout, stderr });
  return EXIT_OK;
}
