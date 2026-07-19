/**
 * Streaming miner entrypoint: aggregates transcript usage (claude or opencode,
 * via --source) and writes report.json + report.md inside the repo root.
 *
 * Two containment roots (fail-closed):
 *   READ  root — ~/.claude/projects (or override); transcript dir must be inside.
 *   WRITE root — repoRoot (process.cwd() by default); output paths must be inside.
 *
 * TOCTOU caveat: containByRealpath returns a lexical path; actual reads/writes
 * happen after the check — acceptable under the local advisory threat model
 * (identical basis to memory/policy containment in contain.js).
 *
 * Advisory: absent / malformed / out-of-bounds dir → recorded no-op report, exit 0.
 * Config error: an unknown/unbuilt --source is the one exception — rejected
 * with a non-zero exit before any I/O begins.
 * Redaction: report contains no file paths, $HOME fragments, or prompt text.
 */

import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import {
  readFileSync as nodeReadFileSync,
  writeFileSync as nodeWriteFileSync,
  createReadStream as nodeCreateReadStream,
  readdirSync as nodeReaddirSync,
} from 'node:fs';
import { createInterface as nodeCreateInterface } from 'node:readline';
import { containByRealpath as nodeContainByRealpath } from '../contain.js';
import { parseLines as claudeParseLines } from './adapters/claude/telemetry.js';
import { parseLines as opencodeParseLines } from './adapters/opencode/telemetry.js';
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
});
const DEFAULT_PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const REPORT_JSON = 'report.json';
const REPORT_MD = 'report.md';
const INLINE_GAP_NOTE =
  'no rollup events found; inline phases excluded by default (pass --include-inline to include)';
// C7: named constants for the remaining no-op notes.
const UNCONTAINED_NOTE = 'transcript dir not contained within projects root';
const ABSENT_NOTE = 'transcript dir absent';
const NO_FILES_NOTE = 'no .jsonl transcript files found';
const NO_EVENTS_NOTE = 'no events provided';

// ── Helpers ──────────────────────────────────────────────────────────────────

function noOpReport(note) {
  return { schemaVersion: 1, runs: [], note };
}

function parseArgs(argv) {
  const parsed = {
    dir: null,
    baseline: null,
    since: null,
    pricesFile: null,
    includeInline: false,
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
      case '--include-inline':
        parsed.includeInline = true;
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

function resolveTranscriptDir(parsedDir, projectsRoot) {
  return parsedDir ? resolve(parsedDir) : projectsRoot;
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

async function streamTranscriptFiles(jsonlFiles, transcriptDir, createReadStream, createInterface, containByRealpath, parseTranscriptLines, since = null) {
  const allEvents = [];
  const allMarkers = [];
  let totalSkipped = 0;
  for (const file of jsonlFiles) {
    // A3: per-file containment guard — each .jsonl child is realpath-checked before streaming.
    const safeFile = containByRealpath(transcriptDir, join(transcriptDir, file));
    if (!safeFile) continue;
    try {
      // Streaming via readline — never readFileSync — avoids OOM on large transcripts.
      const stream = createReadStream(safeFile);
      const lines = createInterface({ input: stream, crlfDelay: Infinity });
      const { events, skipped, markers } = await parseTranscriptLines(lines, since);
      // G2: for-of avoids spread-on-large-array stack overflow.
      for (const e of events) allEvents.push(e);
      for (const m of markers) allMarkers.push(m);
      totalSkipped += skipped;
    } catch {
      continue;
    }
  }
  // C4: propagate total skipped count and the phase-skip markers so callers can surface them.
  return { events: allEvents, skipped: totalSkipped, markers: allMarkers };
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
 *   containByRealpath?: Function, projectsRoot?: string, repoRoot?: string }} io
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
    projectsRoot = DEFAULT_PROJECTS_DIR,
    repoRoot = process.cwd(),
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

  const transcriptDir = resolveTranscriptDir(parsed.dir, projectsRoot);
  // C3: single-call helper — writes a no-op report and returns EXIT_OK.
  const writeNoOp = (note) =>
    attemptWriteReports(repoRoot, noOpReport(note), writeFileSync, containByRealpath, stderr);

  // Read containment: transcript dir must be inside the projects root.
  const safeTranscriptDir = containByRealpath(projectsRoot, transcriptDir);
  if (!safeTranscriptDir) { writeNoOp(UNCONTAINED_NOTE); return EXIT_OK; }

  // Discover .jsonl files in the contained transcript dir.
  let jsonlFiles;
  try {
    jsonlFiles = readdirSync(safeTranscriptDir).filter(f => f.endsWith('.jsonl'));
  } catch (e) {
    const note = e.code === 'ENOENT'
      ? ABSENT_NOTE
      : `cannot read transcript dir (${e.code ?? 'unknown'})`;
    writeNoOp(note);
    return EXIT_OK;
  }

  if (!jsonlFiles.length) { writeNoOp(NO_FILES_NOTE); return EXIT_OK; }

  // Stream-parse all transcript files (never readFileSync — see module header).
  const { events, skipped, markers } = await streamTranscriptFiles(
    jsonlFiles,
    safeTranscriptDir,
    createReadStream,
    createInterface,
    containByRealpath,
    parseTranscriptLines,
    parsed.since ?? null,
  );
  // C4: surface malformed-line count so callers can see parse quality.
  if (skipped > 0) stderr.write(`usage-mine: skipped ${skipped} malformed line(s)\n`);

  if (!events.length) { writeNoOp(parsed.includeInline ? NO_EVENTS_NOTE : INLINE_GAP_NOTE); return EXIT_OK; }

  const priceTable = loadPriceTable(loadJson(parsed.pricesFile, readFileSync, stderr, '--prices'));
  const baselineReport = loadJson(parsed.baseline, readFileSync, stderr, '--baseline') ?? undefined;
  const threshold = resolveThreshold(parsed.threshold);
  const report = aggregate(events, priceTable, baselineReport, threshold, markers);

  attemptWriteReports(repoRoot, report, writeFileSync, containByRealpath, stderr);
  return EXIT_OK;
}
