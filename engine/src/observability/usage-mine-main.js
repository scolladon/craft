/**
 * Streaming miner entrypoint: aggregates transcript usage (claude, opencode,
 * or pi, via --source) and writes report.json + report.md inside the repo root.
 *
 * Two containment roots (fail-closed):
 *   READ  root — source-aware default (or override); transcript dir must be inside.
 *   WRITE root — repoRoot (process.cwd() by default); output paths must be inside.
 *
 * The READ root and the default transcript dir are deliberately two different
 * values. Only the claude source nests a per-project directory under its read
 * root (DEFAULT_TRANSCRIPT_DIRS); every other source's transcript dir IS its
 * read root. Collapsing the two would either shrink the containment boundary
 * to one project (refusing every --dir at any other project on the same box)
 * or widen the default transcript dir past what containment should allow.
 *
 * For sources with a SOURCE_DISCOVERY entry (claude), file discovery walks a
 * pinned multi-level shape via adapter-authored `discover({ listDir, readText })`
 * — the adapter names relative paths only, this module joins, realpath-contains,
 * opens and reads every one of them. Sources with no entry keep the flat
 * single-level readdirSync + matcher path.
 *
 * TOCTOU caveat: containByRealpath returns a lexical path; actual reads/writes
 * happen after the check — acceptable under the local advisory threat model
 * (identical basis to memory/policy containment in contain.js).
 *
 * Advisory: absent / malformed / out-of-bounds dir → recorded no-op report, exit 0.
 * Every counted-fallback branch (unreadable sub-agent dirs, unlabelled
 * transcripts, containment-refused entries, transcripts that failed to open or
 * parse) is advisory too — surfaced on stderr, never gating.
 * Config error: an unknown/unbuilt --source is the one exception — rejected
 * with a non-zero exit before any I/O begins.
 * Redaction: report contains no file paths, $HOME fragments, or prompt text.
 */

import { resolve, join, dirname, sep } from 'node:path';
import { homedir } from 'node:os';
import {
  readFileSync as nodeReadFileSync,
  writeFileSync as nodeWriteFileSync,
  createReadStream as nodeCreateReadStream,
  readdirSync as nodeReaddirSync,
} from 'node:fs';
import { createInterface as nodeCreateInterface } from 'node:readline';
import { containByRealpath as nodeContainByRealpath } from '../contain.js';
import { discover as claudeDiscover } from './adapters/claude/discovery.js';
import { parseLines as claudeParseLines } from './adapters/claude/telemetry.js';
import { parseLines as opencodeParseLines } from './adapters/opencode/telemetry.js';
import { parseLines as piParseLines } from './adapters/pi/telemetry.js';
import { parseLines as copilotParseLines } from './adapters/copilot/telemetry.js';
import { parseLines as codexParseLines } from './adapters/codex/telemetry.js';
import { parseLines as aiderParseLines } from './adapters/aider/telemetry.js';
import { aggregate, serializeReport, renderMarkdown, DEFAULT_DRIFT_THRESHOLD } from './usage-aggregate.js';
import { loadPriceTable } from './adapters/claude/pricing.js';

const EXIT_OK = 0;
// The one deliberate non-zero exit: an unknown/unbuilt --source is a config
// error caught before any I/O — every other path stays advisory (exit 0).
const EXIT_CONFIG_ERROR = 1;
const DEFAULT_SOURCE = 'claude';
// C7: small pure lookup — the selector's entire routing surface.
const SOURCES = Object.freeze({
  claude: claudeParseLines,
  opencode: opencodeParseLines,
  pi: piParseLines,
  copilot: copilotParseLines,
  codex: codexParseLines,
  aider: aiderParseLines,
});
const DEFAULT_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
// C7: source→default-read-root lookup, each entry a thunk so an env-backed
// default (pi's session dir) is read per invocation, never frozen stale at
// module-load time. Sources with no entry fall back to the claude default —
// this is a generic per-source seam, not a pi special-case.
const DEFAULT_READ_ROOTS = Object.freeze({
  claude: () => DEFAULT_PROJECTS_DIR,
  pi: () => process.env.PI_CODING_AGENT_SESSION_DIR || join(homedir(), '.pi', 'agent', 'sessions'),
  // COPILOT_OTEL_FILE_EXPORTER_PATH names a single FILE, unlike every other
  // entry here which names a directory — resolve to the file's containing
  // directory so the port's directory contract holds without a second env var.
  copilot: () => process.env.COPILOT_OTEL_FILE_EXPORTER_PATH
    ? dirname(process.env.COPILOT_OTEL_FILE_EXPORTER_PATH)
    : join(homedir(), '.copilot', 'otel'),
  // Codex sessions live at $CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl —
  // this entry resolves the BOUNDARY (`sessions/`), not the leaf. readdirSync
  // above is non-recursive, so a --dir pointing at this boundary enumerates
  // only the top YYYY/ entries, finds no .jsonl files there, and yields a
  // silent zero-cost report that reads as success. Callers must pass --dir
  // all the way down to the YYYY/MM/DD leaf.
  codex: () => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions'),
  // Aider persists .aider.chat.history.md at the git root, which is the
  // working dir craft runs the CLI in. Same boundary caveat as codex above:
  // this default assumes cwd IS the git root; a sub-directory cwd needs an
  // explicit --dir pointing back down at the root.
  aider: () => process.cwd(),
});

// C7: source→discovery-filter lookup, mirroring DEFAULT_READ_ROOTS. Each entry
// pairs the matcher with the label naming what it looks for, so the zero-file
// note (below) can never drift out of sync with the matcher it describes.
// Sources with no entry fall back to the default .jsonl matcher/label. Aider's
// matcher is deliberately an exact-equality check, not a suffix match — the
// working dir also holds .aider.input.history / .aider.llm.history, which
// must NOT be picked up as transcripts.
const SOURCE_FILE_MATCHERS = Object.freeze({
  aider: { match: (f) => f === '.aider.chat.history.md', label: '.aider.chat.history.md' },
});
const DEFAULT_FILE_MATCHER = (f) => f.endsWith('.jsonl');
const DEFAULT_FILE_LABEL = '.jsonl';

// Exported as a direct unit-test seam, mirroring resolveDefaultReadRoot. The
// match/label pair is resolved together — they always describe the same
// source, so there is exactly one lookup rather than two independently
// drifting ones. Own-property check: a bare `SOURCE_FILE_MATCHERS[source]`
// would resolve inherited members (__proto__, constructor, …) to a truthy
// entry and slip past the intended default-pair fallback.
export function resolveSourceFilter(source) {
  return Object.hasOwn(SOURCE_FILE_MATCHERS, source)
    ? SOURCE_FILE_MATCHERS[source]
    : { match: DEFAULT_FILE_MATCHER, label: DEFAULT_FILE_LABEL };
}

// Thin unit-test seams over resolveSourceFilter, kept for call sites and
// tests that only need one half of the pair.
export function resolveFileMatcher(source) {
  return resolveSourceFilter(source).match;
}

export function resolveFileLabel(source) {
  return resolveSourceFilter(source).label;
}

// Exported as a direct unit-test seam: resolving the default read root is a
// pure lookup + thunk-call, testable without touching the real filesystem.
// Own-property check: a bare `DEFAULT_READ_ROOTS[source]` would resolve
// inherited members (__proto__, constructor, …) to a truthy thunk and slip
// past the intended claude fallback — mirrors the SOURCES gate below.
export function resolveDefaultReadRoot(source) {
  const thunk = Object.hasOwn(DEFAULT_READ_ROOTS, source)
    ? DEFAULT_READ_ROOTS[source]
    : DEFAULT_READ_ROOTS.claude;
  return thunk();
}

// C7: source→default-transcript-dir lookup, mirroring SOURCE_FILE_MATCHERS —
// a single named entry plus a default, not a conditional. Deliberately
// SEPARATE from DEFAULT_READ_ROOTS: only the claude layout nests a
// per-project directory under its read root. Pointing the containment
// ROOT itself at that nested directory (instead of just the default
// transcript DIR) would shrink the boundary to one project and start
// refusing every explicit --dir at any other project on the same box.
const DEFAULT_TRANSCRIPT_DIRS = Object.freeze({
  claude: (root, cwd) => join(root, dashedCwd(cwd)),
});
const DEFAULT_TRANSCRIPT_DIR = (root) => root; // today's behaviour, every other source

// Every path separator and every '.' becomes '-'. Verified live against the
// real projects root: '/Users/x/y/z' -> '-Users-x-y-z', and a nested path
// producing a doubled dash. No path on this box contains a '.', so the dot
// rule itself is unverified locally.
export function dashedCwd(cwd) {
  return cwd.split(sep).join('-').replace(/\./g, '-');
}

// Exported as a direct unit-test seam, mirroring resolveDefaultReadRoot.
// Own-property check for the same inherited-member reason as the other
// per-source lookups in this module.
export function resolveDefaultTranscriptDir(source, projectsRoot, cwd) {
  const resolver = Object.hasOwn(DEFAULT_TRANSCRIPT_DIRS, source)
    ? DEFAULT_TRANSCRIPT_DIRS[source]
    : DEFAULT_TRANSCRIPT_DIR;
  return resolver(projectsRoot, cwd);
}

// C7: source→discovery-walk lookup. Sources with no entry keep the flat
// single-level readdirSync + matcher path unchanged below.
const SOURCE_DISCOVERY = Object.freeze({ claude: claudeDiscover });

const REPORT_JSON = 'report.json';
const REPORT_MD = 'report.md';
// C7: named constants for the no-op notes.
const UNCONTAINED_NOTE = 'transcript dir not contained within projects root';
const ABSENT_NOTE = 'transcript dir absent';
const NO_EVENTS_NOTE = 'no events provided';

// ── Helpers ──────────────────────────────────────────────────────────────────

function noOpReport(note) {
  return { schemaVersion: 1, runs: [], note };
}

// Couples the zero-file note to the same per-source label resolveSourceFilter
// discovers with, so the message always names the filename the matcher for
// that source actually looks for.
function noFilesNote(source) {
  return `no ${resolveFileLabel(source)} transcript files found`;
}

function parseArgs(argv) {
  const parsed = {
    dir: null,
    baseline: null,
    since: null,
    pricesFile: null,
    includeInline: true,
    threshold: null,
    source: null,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--dir':
        parsed.dir = argv[++i] ?? null;
        break;
      case '--source':
        parsed.source = argv[++i] ?? null;
        break;
      case '--baseline':
        parsed.baseline = argv[++i] ?? null;
        break;
      case '--since':
        parsed.since = argv[++i] ?? null;
        break;
      case '--prices':
        parsed.pricesFile = argv[++i] ?? null;
        break;
      case '--no-inline':
        parsed.includeInline = false;
        break;
      case '--threshold':
        parsed.threshold = argv[++i] ?? null;
        break;
    }
  }
  return parsed;
}

function resolveThreshold(rawThreshold) {
  if (rawThreshold == null) return DEFAULT_DRIFT_THRESHOLD;
  const parsed = Number(rawThreshold);
  return Number.isFinite(parsed) ? parsed : DEFAULT_DRIFT_THRESHOLD;
}

function resolveTranscriptDir(parsedDir, defaultTranscriptDir) {
  return parsedDir ? resolve(parsedDir) : defaultTranscriptDir;
}

// Named error message — no boolean params, one targeted stderr line.
function unknownSourceMessage(source) {
  return `usage-mine: unknown --source '${source}' (expected: ${Object.keys(SOURCES).join('|')})\n`;
}

function loadJson(filePath, readFileSync, stderr, kind) {
  if (!filePath) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    // B2: surface note when an explicit --prices/--baseline path is unreadable.
    if (stderr && kind) stderr.write(`usage-mine: ignoring unreadable ${kind}\n`);
    return null;
  }
}

// `entries` carries { relPath, context } pairs — relPath is realpath-checked
// per entry exactly as a bare filename was before; context is the adapter's
// opaque sidecar label (or null for sources with no SOURCE_DISCOVERY entry).
// includeInline is authored HERE, spread alongside the adapter's own context —
// this module never reads a field of that context, only adds its own key.
async function streamTranscriptFiles(entries, transcriptDir, createReadStream, createInterface, containByRealpath, parseTranscriptLines, since = null, includeInline = true) {
  const allEvents = [];
  const allMarkers = [];
  let totalSkipped = 0;
  let totalUnlabelled = 0;
  let refused = 0;
  // a transcript that fails to open or parse must not vanish silently —
  // it is counted here and surfaced on stderr by the caller, same as every
  // other counted-fallback branch.
  let failed = 0;
  for (const entry of entries) {
    // A3: per-entry containment guard — a discovery-supplied relPath is
    // realpath-checked before streaming exactly like a flat filename was;
    // reach extends to the discovery depth, the check itself is unchanged.
    const safeFile = containByRealpath(transcriptDir, join(transcriptDir, entry.relPath));
    if (!safeFile) { refused++; continue; }
    try {
      // Streaming via readline — never readFileSync — avoids OOM on large transcripts.
      const stream = createReadStream(safeFile);
      const lines = createInterface({ input: stream, crlfDelay: Infinity });
      const parseContext = { ...(entry.context ?? {}), includeInline };
      const { events, skipped, markers, unlabelled } = await parseTranscriptLines(lines, since, parseContext);
      // G2: for-of avoids spread-on-large-array stack overflow.
      for (const e of events) allEvents.push(e);
      for (const m of markers) allMarkers.push(m);
      totalSkipped += skipped;
      totalUnlabelled += unlabelled ?? 0;
    } catch {
      failed++;
      continue;
    }
  }
  // C4: propagate total skipped/unlabelled/refused/failed counts and the
  // phase-skip markers so callers can surface them — every one advisory,
  // never gating.
  return { events: allEvents, skipped: totalSkipped, markers: allMarkers, unlabelled: totalUnlabelled, refused, failed };
}

// The ports discover() receives — both absorb their own failures into the
// documented null and never throw, which is what lets discover() stay a pure
// walk with containment un-bypassable by adapter code even in principle.
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

function attemptWriteReports(repoRoot, report, writeFileSync, checkContain, stderr) {
  const jsonPath = join(repoRoot, REPORT_JSON);
  // Write containment: output must land inside the repo.
  const safeJson = checkContain(repoRoot, jsonPath);
  if (!safeJson) {
    stderr.write('usage-mine: write containment rejected report.json\n');
    return;
  }
  // A1: md path is also realpath-contained before writing.
  const safeMd = checkContain(repoRoot, join(repoRoot, REPORT_MD));
  if (!safeMd) {
    stderr.write('usage-mine: write containment rejected report.md\n');
    return;
  }
  // A2: advisory — write failures are logged, never gating.
  // TOCTOU caveat: safeJson/safeMd are lexical; actual writes happen next — see module header.
  try {
    writeFileSync(safeJson, serializeReport(report), 'utf8');
  } catch (e) {
    stderr.write(`usage-mine: report write failed (${e.code ?? 'unknown'})\n`);
    return;
  }
  try {
    writeFileSync(safeMd, renderMarkdown(report), 'utf8');
  } catch (e) {
    stderr.write(`usage-mine: report write failed (${e.code ?? 'unknown'})\n`);
  }
}

// ── Public entrypoint ─────────────────────────────────────────────────────────

/**
 * Main entrypoint for usage-mine.
 *
 * @param {string[]} argv
 * @param {{ stderr: { write(s: string): void }, readFileSync?: Function,
 *   writeFileSync?: Function, createReadStream?: Function,
 *   createInterface?: Function, readdirSync?: Function,
 *   containByRealpath?: Function, projectsRoot?: string, repoRoot?: string,
 *   cwd?: string }} io
 * @returns {Promise<number>} exit code — 0 for every advisory path (default
 *   claude source, all no-op/malformed/containment branches); the one
 *   exception is an unknown/unbuilt `--source`, a config error caught before
 *   any I/O begins, which returns a non-zero exit.
 */
export async function main(argv, io) {
  const {
    stderr,
    readFileSync = nodeReadFileSync,
    writeFileSync = nodeWriteFileSync,
    createReadStream = nodeCreateReadStream,
    createInterface = nodeCreateInterface,
    readdirSync = nodeReaddirSync,
    containByRealpath = nodeContainByRealpath,
    projectsRoot: projectsRootOverride,
    repoRoot = process.cwd(),
    cwd = process.cwd(),
  } = io;

  const parsed = parseArgs(argv);

  // Config-error gate — validated before any I/O begins (readdirSync, fs reads/writes).
  // Own-property check: a bare `SOURCES[source]` would resolve inherited members
  // (__proto__, constructor, …) to truthy values and slip past the fail-closed gate.
  const source = parsed.source ?? DEFAULT_SOURCE;
  if (!Object.hasOwn(SOURCES, source)) {
    stderr.write(unknownSourceMessage(source));
    return EXIT_CONFIG_ERROR;
  }
  const parseTranscriptLines = SOURCES[source];
  // Source-aware read root: an explicit io.projectsRoot override always wins
  // (tests inject it); otherwise the default resolves per source. This is the
  // CONTAINMENT root and stays the same value regardless of --dir or of the
  // per-source default transcript dir below — see the module header.
  const projectsRoot = projectsRootOverride ?? resolveDefaultReadRoot(source);
  const defaultTranscriptDir = resolveDefaultTranscriptDir(source, projectsRoot, cwd);

  const transcriptDir = resolveTranscriptDir(parsed.dir, defaultTranscriptDir);
  // C3: single-call helper — writes a no-op report and returns EXIT_OK.
  const writeNoOp = (note) =>
    attemptWriteReports(repoRoot, noOpReport(note), writeFileSync, containByRealpath, stderr);

  // Read containment: transcript dir must be inside the projects root.
  const safeTranscriptDir = containByRealpath(projectsRoot, transcriptDir);
  if (!safeTranscriptDir) { writeNoOp(UNCONTAINED_NOTE); return EXIT_OK; }

  // Unfiltered probe — the note-producing read for ENOENT vs. any other
  // error. Kept exactly as before regardless of which discovery path runs
  // next: a source-specific walk still needs to know the dir was readable at
  // all before it starts naming relative paths inside it.
  let rootListing;
  try {
    rootListing = readdirSync(safeTranscriptDir);
  } catch (e) {
    const note = e.code === 'ENOENT'
      ? ABSENT_NOTE
      : `cannot read transcript dir (${e.code ?? 'unknown'})`;
    writeNoOp(note);
    return EXIT_OK;
  }

  // Discover transcript entries: a source-specific multi-level walk behind
  // injected ports when one is registered, otherwise the flat single-level
  // matcher over the probe above — unchanged for every other binding.
  const { entries, unreadable } = Object.hasOwn(SOURCE_DISCOVERY, source)
    ? SOURCE_DISCOVERY[source](makeDiscoveryPorts(safeTranscriptDir, { readdirSync, readFileSync, containByRealpath }))
    : { entries: rootListing.filter(resolveFileMatcher(source)).map((relPath) => ({ relPath, context: null })), unreadable: 0 };

  if (!entries.length) { writeNoOp(noFilesNote(source)); return EXIT_OK; }

  // Stream-parse all transcript entries (never readFileSync — see module header).
  const { events, skipped, markers, unlabelled, refused, failed } = await streamTranscriptFiles(
    entries,
    safeTranscriptDir,
    createReadStream,
    createInterface,
    containByRealpath,
    parseTranscriptLines,
    parsed.since ?? null,
    parsed.includeInline,
  );
  // C4: surface counted-fallback tallies so callers can see run quality —
  // every line advisory, emitted only when its count is > 0.
  if (skipped > 0) stderr.write(`usage-mine: skipped ${skipped} malformed line(s)\n`);
  if (unlabelled > 0) stderr.write(`usage-mine: ${unlabelled} transcript(s) with no resolvable agent label\n`);
  if (unreadable > 0) stderr.write(`usage-mine: ${unreadable} unreadable sub-agent directory(ies)\n`);
  if (refused > 0) stderr.write(`usage-mine: ${refused} path(s) refused by read containment\n`);
  // a transcript dropped by streamTranscriptFiles' catch (open/parse failure)
  // must leave the same kind of trace as every other counted-fallback branch.
  if (failed > 0) stderr.write(`usage-mine: ${failed} transcript(s) could not be read\n`);

  if (!events.length) { writeNoOp(NO_EVENTS_NOTE); return EXIT_OK; }

  const priceTable = loadPriceTable(loadJson(parsed.pricesFile, readFileSync, stderr, '--prices'));
  const baselineReport = loadJson(parsed.baseline, readFileSync, stderr, '--baseline') ?? undefined;
  const threshold = resolveThreshold(parsed.threshold);
  const report = aggregate(events, priceTable, baselineReport, threshold, markers);

  attemptWriteReports(repoRoot, report, writeFileSync, containByRealpath, stderr);
  return EXIT_OK;
}
