/**
 * In-process unit tests for usage-mine-main() entrypoint.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 * The subprocess bin tests in usage-mine.bin.test.js prove end-to-end wiring;
 * these tests drive every advisory branch including two-root containment and streaming.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  createReadStream,
  rmSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { main, resolveDefaultReadRoot } from '../src/observability/usage-mine-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';
import { containByRealpath } from '../src/contain.js';
import { serializeReport } from '../src/observability/usage-aggregate.js';

const OPENCODE_FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const OPENCODE_FIXTURE_DIR = join(OPENCODE_FIXTURES_ROOT, 'opencode');
const PI_FIXTURE_DIR = join(OPENCODE_FIXTURES_ROOT, 'pi');
const PI_SESSION_ENV_VAR = 'PI_CODING_AGENT_SESSION_DIR';
const COPILOT_FIXTURE_DIR = join(OPENCODE_FIXTURES_ROOT, 'copilot');
const COPILOT_OTEL_ENV_VAR = 'COPILOT_OTEL_FILE_EXPORTER_PATH';

// A valid rollup JSONL line (matches single-rollup.jsonl fixture structure).
const ROLLUP_LINE = JSON.stringify({
  type: 'user',
  sessionId: 'sess-aaa',
  slug: 'feature-x',
  cwd: '/repo',
  timestamp: '2026-01-01T00:00:00.000Z',
  toolUseResult: {
    agentType: 'craft:designer',
    resolvedModel: 'claude-opus-4-8',
    totalDurationMs: 589907,
    totalTokens: 197219,
    totalToolUseCount: 10,
    usage: {
      input_tokens: 2,
      cache_read_input_tokens: 196062,
      cache_creation_input_tokens: 255,
      output_tokens: 900,
      cache_creation: { ephemeral_5m_input_tokens: 255, ephemeral_1h_input_tokens: 0 },
    },
    status: 'completed',
    agentId: 'agent-1',
  },
  isSidechain: false,
});

// A non-rollup line (inline usage, no toolUseResult — silently ignored by parseLines).
const INLINE_LINE = JSON.stringify({
  type: 'assistant',
  sessionId: 'sess-bbb',
  timestamp: '2026-01-01T00:01:00.000Z',
  message: {
    role: 'assistant',
    content: 'hello',
    usage: { input_tokens: 10, output_tokens: 5 },
  },
});

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function makeTmp(prefix = 'usage-mine-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/**
 * Build a projects root with one transcript subdir containing a .jsonl file.
 * Returns { projectsRoot, transcriptDir }.
 */
function makeFixture({ lines = [ROLLUP_LINE] } = {}) {
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'project-slug');
  mkdirSync(transcriptDir);
  writeFileSync(join(transcriptDir, 'transcript.jsonl'), lines.join('\n') + '\n', 'utf8');
  return { projectsRoot, transcriptDir };
}

/**
 * Minimal io double that wires real fs/readline deps by default, with
 * projectsRoot and repoRoot overrides supplied per test.
 */
function makeIo(overrides = {}) {
  const io = makeCaptureIo();
  return {
    ...io,
    readFileSync,
    writeFileSync,
    createReadStream,
    createInterface,
    containByRealpath,
    ...overrides,
  };
}

// ─── 1. Happy path — writes report.json + report.md, exits 0 ─────────────────

test('Given a contained fixture dir of jsonl lines, when main streams it, then it writes report.json and report.md inside the repo and exits 0', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `expected exit 0; stderr: ${io.stderr.joined()}`);
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'report.json must exist');
  assert.ok(existsSync(join(repoRoot, 'report.md')), 'report.md must exist');
});

test('Given a contained fixture dir, when main runs, then report.json is valid JSON with schemaVersion 1 and runs array', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', transcriptDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.schemaVersion, 1);
  assert.ok(Array.isArray(report.runs), 'report.runs must be an array');
});

// ─── 2. Read containment rejection → no-op report, exit 0 ────────────────────

test('Given a --dir that escapes projectsRoot via traversal, when main runs, then it writes a no-op report with a note and exits 0', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const outsideDir = makeTmp('outside-');
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', outsideDir], io);

  assert.equal(result, 0);
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'no-op report.json must be written');
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.runs, []);
  assert.ok(typeof report.note === 'string' && report.note.length > 0, 'note must be set');
});

// ─── 3. Write containment rejection → stderr note, exit 0 ────────────────────

test('Given an output path that would escape repoRoot (containByRealpath returns null for write), when main runs, then it is a recorded no-op and exits 0', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  // Inject containByRealpath that rejects write paths (report.json) but passes read paths.
  const mockContain = (root, target) => {
    if (root === repoRoot) return null; // simulate write containment failure
    return containByRealpath(root, target);
  };
  const io = makeIo({ projectsRoot, repoRoot, containByRealpath: mockContain });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0);
  assert.ok(
    io.stderr.joined().includes('write containment'),
    `stderr must note write containment rejection; got: ${io.stderr.joined()}`,
  );
  assert.ok(!existsSync(join(repoRoot, 'report.json')), 'report.json must NOT be written when write containment fails');
});

// ─── 4. Advisory no-op — absent / empty / malformed-only dir ─────────────────

test('Given an absent transcript dir, when main runs, then the report is a no-op and exit is 0', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const repoRoot = makeTmp('repo-');
  const absentDir = join(projectsRoot, 'no-such-project');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', absentDir], io);

  assert.equal(result, 0);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.runs, []);
  assert.ok(typeof report.note === 'string', 'report must carry a note for absent dir');
});

test('Given an empty transcript dir (no .jsonl files), when main runs, then the report is a no-op and exit is 0', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'empty-project');
  mkdirSync(transcriptDir);
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.deepEqual(report.runs, []);
  assert.ok(typeof report.note === 'string');
});

test('Given a transcript dir with only malformed-JSON lines, when main runs, then the report is a no-op and exit is 0', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture({ lines: ['not valid json', '{broken'] });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.deepEqual(report.runs, []);
});

// ─── 5. Streaming proof — never readFileSync transcripts ─────────────────────

test('Given a transcript file, when main streams it, then it never calls readFileSync for transcript paths', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');

  const readFileSyncSpy = (path, enc) => {
    if (typeof path === 'string' && path.endsWith('.jsonl')) {
      throw new Error(`readFileSync must not be called for transcripts; called with: ${path}`);
    }
    return readFileSync(path, enc);
  };

  const io = makeIo({ projectsRoot, repoRoot, readFileSync: readFileSyncSpy });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `must exit 0; stderr: ${io.stderr.joined()}`);
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'report.json must exist');
});

// ─── 6. --baseline → report carries baselineDeltas ───────────────────────────

test('Given a baseline report and a current run, when main runs with --baseline, then report.json carries baselineDeltas', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');

  // Build a minimal baseline report (same schema as serializeReport output).
  const baselineReport = { schemaVersion: 1, runs: [], recommendations: [] };
  const baselinePath = join(repoRoot, 'baseline.json');
  writeFileSync(baselinePath, serializeReport(baselineReport), 'utf8');

  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir, '--baseline', baselinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok('baselineDeltas' in report, 'report must carry baselineDeltas when --baseline is provided');
});

// ─── 6b. --baseline + default --threshold → report.drift flags a phase whose delta exceeds 0.25 ──

function makeDriftedBaselineReport(tokens) {
  return {
    schemaVersion: 1,
    runs: [{
      run: 'sess-aaa',
      slug: 'feature-x',
      groups: [{
        phase: 'design', role: 'designer', model: 'claude-opus-4-8',
        tokens, durationMs: 589907, messages: 10, cacheEfficiency: 0,
        cost: { priced: null, relative: 150000 },
      }],
      reviewCycles: [],
    }],
    recommendations: [],
  };
}

test('Given a baseline group whose token-total is far below the mined fixture, when main runs with --baseline and no --threshold, then report.drift flags the design phase', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');

  // Mined fixture group total tokens = 2 + 196062 + 255 + 900 = 197219.
  // Baseline group total tokens = 1 + 149000 + 200 + 799 = 150000 → relDelta ≈ 0.31 (> default 0.25).
  const baselineReport = makeDriftedBaselineReport({ input: 1, cacheRead: 149000, cacheCreation: 200, output: 799 });
  const baselinePath = join(repoRoot, 'baseline.json');
  writeFileSync(baselinePath, serializeReport(baselineReport), 'utf8');

  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir, '--baseline', baselinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(
    report.drift.some(d => d.phase === 'design' && d.dimension === 'tokens-total'),
    'default threshold must flag the design phase token-total drift'
  );
});

test('Given the same drifted baseline group, when main runs with --threshold above the delta, then report.drift is empty', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');

  const baselineReport = makeDriftedBaselineReport({ input: 1, cacheRead: 149000, cacheCreation: 200, output: 799 });
  const baselinePath = join(repoRoot, 'baseline.json');
  writeFileSync(baselinePath, serializeReport(baselineReport), 'utf8');

  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir, '--baseline', baselinePath, '--threshold', '0.5'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.drift.length, 0, '--threshold override above the delta must suppress the flag');
});

test('Given a small nonzero drift below the default threshold, when main runs with --baseline and no --threshold flag, then report.drift does not flag it (an omitted flag must resolve to 0.25, not 0)', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');

  // Mined fixture group total tokens = 197219 (see the 6b comment above).
  // Baseline total = 187827 → relDelta ≈ +0.05, comfortably below the 0.25 default
  // but far above 0 — only a correctly-resolved default threshold rejects it.
  const baselineReport = makeDriftedBaselineReport({ input: 187827, cacheRead: 0, cacheCreation: 0, output: 0 });
  const baselinePath = join(repoRoot, 'baseline.json');
  writeFileSync(baselinePath, serializeReport(baselineReport), 'utf8');

  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir, '--baseline', baselinePath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.drift.length, 0, 'an omitted --threshold flag must resolve to the 0.25 default, not 0');
});

// ─── 7. --prices override — custom model is priced ───────────────────────────

test('Given a --prices override file with a custom model, when main runs, then the report is written without error', async () => {
  const sut = main;
  // Use a known model that has pricing so we can verify the override was applied.
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const pricesOverride = { 'claude-opus-4-8': { input: 999, output: 999, cacheRead: 99, cacheCreation5m: 1249, cacheCreation1h: 1998 } };
  const pricesPath = join(repoRoot, 'prices.json');
  writeFileSync(pricesPath, JSON.stringify(pricesOverride), 'utf8');

  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir, '--prices', pricesPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  // With absurdly high override prices, cost must be non-zero for the known model.
  assert.ok(report.runs.length > 0, 'must have runs');
  const totalCost = report.runs.flatMap(r => r.groups).reduce((s, g) => s + (g.cost.priced ?? 0), 0);
  assert.ok(totalCost > 0, 'cost must reflect override prices');
});

// ─── 8. --include-inline OFF default → noted gap, no fabricated cost ─────────

test('Given a spawn-sparse dir (inline-only lines) without --include-inline, when main runs, then report is a noted no-op and exit is 0', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture({ lines: [INLINE_LINE] });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.deepEqual(report.runs, [], 'runs must be empty — no fabricated cost');
  assert.ok(
    typeof report.note === 'string' && report.note.toLowerCase().includes('inline'),
    `note must mention inline gap; got: ${report.note}`,
  );
});

// ─── No-op report contains no absolute paths ─────────────────────────────────

test('Given a read-containment rejection, when main runs, then the written no-op report contains no absolute paths or home dir fragments', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const outsideDir = makeTmp('outside-');
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', outsideDir], io);

  const raw = readFileSync(join(repoRoot, 'report.json'), 'utf8');
  const home = process.env.HOME ?? '';
  assert.ok(!raw.includes(outsideDir), 'report must not contain the rejected dir path');
  if (home) assert.ok(!raw.includes(home), 'report must not contain $HOME');
});

// ─── Populated-report no-leak (F1) ───────────────────────────────────────────

test('Given a fixture with real transcript data, when main runs, then the populated report has runs and leaks no paths or $HOME', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `expected exit 0; stderr: ${io.stderr.joined()}`);
  const raw = readFileSync(join(repoRoot, 'report.json'), 'utf8');
  const report = JSON.parse(raw);
  assert.ok(report.runs.length > 0, 'populated report must have at least one run');
  const home = process.env.HOME ?? '';
  assert.ok(!raw.includes(transcriptDir), 'report must not contain the transcript dir path');
  assert.ok(!raw.includes(projectsRoot), 'report must not contain projectsRoot');
  if (home) assert.ok(!raw.includes(home), 'report must not contain $HOME');
  // Key whitelist: only known top-level keys should appear.
  const keys = Object.keys(report).sort();
  for (const k of keys) {
    assert.ok(['schemaVersion', 'runs', 'recommendations', 'baselineDeltas', 'note'].includes(k), `unexpected top-level key: ${k}`);
  }
});

// ─── --include-inline ON path (F4) ───────────────────────────────────────────

test('Given an inline-only transcript dir with --include-inline flag, when main runs, then exit 0 and note is exactly "no events provided"', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture({ lines: [INLINE_LINE] });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir, '--include-inline'], io);

  assert.equal(result, 0);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.note, 'no events provided', `expected note "no events provided"; got: ${report.note}`);
});

// ─── Malformed --prices JSON (F5) ────────────────────────────────────────────

test('Given a malformed --prices JSON file, when main runs, then exit 0 with defaults used and report still written', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const pricesPath = join(repoRoot, 'bad-prices.json');
  writeFileSync(pricesPath, 'not valid json', 'utf8');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir, '--prices', pricesPath], io);

  assert.equal(result, 0, `expected exit 0; stderr: ${io.stderr.joined()}`);
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'report.json must be written even with malformed prices');
  assert.ok(io.stderr.joined().includes('ignoring unreadable'), 'stderr must note the malformed prices file');
});

// ─── P29 kill-tests: target survivors from mutation run ──────────────────────

// ─── P29-1. absent dir note is exactly ABSENT_NOTE ───────────────────────────

test('Given an absent transcript dir, when main runs, then the report note is the exact absent-dir string', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const absentDir = join(projectsRoot, 'no-such-project');
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', absentDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.note, 'transcript dir absent', 'note must be the exact absent-dir string');
});

// ─── P29-2. no-files dir note is exactly NO_FILES_NOTE ───────────────────────

test('Given an empty transcript dir (no .jsonl files), when main runs, then the report note is the exact no-files string', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const emptyDir = join(projectsRoot, 'empty-project');
  mkdirSync(emptyDir);
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', emptyDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.note, 'no .jsonl transcript files found', 'note must be the exact no-files string');
});

// ─── P29-3. --since filters events by timestamp ──────────────────────────────

test('Given two rollup lines with timestamps before and after a --since cutoff, when main runs with --since, then only the later event appears in the report', async () => {
  const sut = main;
  const BEFORE = JSON.stringify({
    type: 'user', sessionId: 'sess-before', slug: 'f', timestamp: '2026-01-01T00:00:00.000Z',
    toolUseResult: {
      agentType: 'craft:designer', resolvedModel: 'claude-sonnet-4-6',
      totalDurationMs: 100, totalToolUseCount: 1,
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const AFTER = JSON.stringify({
    type: 'user', sessionId: 'sess-after', slug: 'f', timestamp: '2026-06-01T00:00:00.000Z',
    toolUseResult: {
      agentType: 'craft:planner', resolvedModel: 'claude-sonnet-4-6',
      totalDurationMs: 200, totalToolUseCount: 2,
      usage: { input_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 2 },
    },
  });
  const { projectsRoot, transcriptDir } = makeFixture({ lines: [BEFORE, AFTER] });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', transcriptDir, '--since', '2026-03-01T00:00:00.000Z'], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.runs.length, 1, 'only the after-cutoff event must be in the report');
  assert.equal(report.runs[0].run, 'sess-after', 'run id must be the after-cutoff session');
});

// ─── P29-4. skipped count accumulates across multiple files ──────────────────

test('Given two transcript files each with one malformed line, when main runs, then stderr reports 2 skipped malformed lines', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'project');
  mkdirSync(transcriptDir);
  writeFileSync(join(transcriptDir, 'a.jsonl'), 'not valid json\n', 'utf8');
  writeFileSync(join(transcriptDir, 'b.jsonl'), '{bad}\n', 'utf8');
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', transcriptDir], io);

  assert.ok(io.stderr.joined().includes('skipped 2'), `stderr must report 2 skipped; got: ${io.stderr.joined()}`);
});

// ─── P29-5. write containment rejection log names report.json specifically ───

test('Given a containByRealpath that rejects the json write path but allows reads, when main runs, then stderr names report.json in the rejection message', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const mockContain = (root, target) => {
    if (root === repoRoot && target.endsWith('report.json')) return null;
    return containByRealpath(root, target);
  };
  const io = makeIo({ projectsRoot, repoRoot, containByRealpath: mockContain });

  await sut(['--dir', transcriptDir], io);

  assert.ok(io.stderr.joined().includes('report.json'), `stderr must name report.json; got: ${io.stderr.joined()}`);
});

// ─── P29-6. uncontained transcript dir note is the exact UNCONTAINED_NOTE ────

test('Given a --dir that escapes the projects root, when main runs, then the report note is the exact uncontained string', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const outsideDir = makeTmp('outside-');
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', outsideDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.note, 'transcript dir not contained within projects root',
    'note must be the exact uncontained string');
});

// ─── P29-7. non-.jsonl files in transcript dir are filtered out ───────────────

test('Given a transcript dir containing both a .jsonl rollup file and a .txt file, when main runs, then only the .jsonl file is processed', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'project');
  mkdirSync(transcriptDir);
  writeFileSync(join(transcriptDir, 'transcript.jsonl'), ROLLUP_LINE + '\n', 'utf8');
  writeFileSync(join(transcriptDir, 'notes.txt'), 'this should be ignored\n', 'utf8');
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', transcriptDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.runs.length, 1, 'only the .jsonl file must be processed');
});

// ─── P29-8. ENOENT error gives transcript-dir-absent note ────────────────────

test('Given a transcript dir that exists but is then removed before readdirSync, when main catches ENOENT, then the report note is the absent string', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'project');
  mkdirSync(transcriptDir);
  const repoRoot = makeTmp('repo-');
  const enoentError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  const mockReaddirSync = () => { throw enoentError; };
  const io = makeIo({ projectsRoot, repoRoot, readdirSync: mockReaddirSync });

  await sut(['--dir', transcriptDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.note, 'transcript dir absent', 'ENOENT must produce the absent-dir note');
});

// ─── P29-9. non-ENOENT error gives code-specific note ────────────────────────

test('Given readdirSync throwing an EACCES error, when main runs, then the report note includes the error code', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'project');
  mkdirSync(transcriptDir);
  const repoRoot = makeTmp('repo-');
  const eaccesError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
  const mockReaddirSync = () => { throw eaccesError; };
  const io = makeIo({ projectsRoot, repoRoot, readdirSync: mockReaddirSync });

  await sut(['--dir', transcriptDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(report.note.includes('EACCES'), `non-ENOENT note must include error code; got: ${report.note}`);
});

// ─── P29-10. skipped stderr message exact text ───────────────────────────────

test('Given a transcript with one malformed line, when main runs, then stderr contains the exact skipped-line message', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture({ lines: ['not json', ROLLUP_LINE] });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', transcriptDir], io);

  assert.ok(io.stderr.joined().includes('skipped 1 malformed line'), `stderr must say "skipped 1 malformed line"; got: ${io.stderr.joined()}`);
});

// ─── P29-11. --baseline error message names --baseline ───────────────────────

test('Given a malformed --baseline file, when main runs, then stderr error message names --baseline', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const badBaselinePath = join(repoRoot, 'bad-baseline.json');
  writeFileSync(badBaselinePath, 'not valid json', 'utf8');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', transcriptDir, '--baseline', badBaselinePath], io);

  assert.ok(io.stderr.joined().includes('--baseline'), `stderr must name --baseline; got: ${io.stderr.joined()}`);
});

// ─── P29-12. safeMd containment rejection names report.md ────────────────────

test('Given a containByRealpath that accepts json but rejects the md write path, when main runs, then stderr names report.md in the rejection message', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const mockContain = (root, target) => {
    if (root === repoRoot && target.endsWith('report.md')) return null;
    return containByRealpath(root, target);
  };
  const io = makeIo({ projectsRoot, repoRoot, containByRealpath: mockContain });

  await sut(['--dir', transcriptDir], io);

  assert.ok(io.stderr.joined().includes('report.md'), `stderr must name report.md; got: ${io.stderr.joined()}`);
  assert.ok(!io.stderr.joined().includes('report.json'), 'stderr must NOT name report.json when json passed but md rejected');
});

// ─── P29-13. non-.jsonl files in transcript dir are not processed ─────────────

test('Given a transcript dir containing both a .jsonl rollup file and a .txt file, when main runs, then only the .jsonl is processed and stderr contains no skipped message', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  writeFileSync(join(transcriptDir, 'notes.txt'), 'not json at all', 'utf8');
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', transcriptDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.runs.length, 1, 'only the .jsonl event must be processed');
  assert.ok(!io.stderr.joined().includes('skipped'), `stderr must not mention skipped; got: ${io.stderr.joined()}`);
});

// ─── P29-14. all-valid lines + no --baseline → stderr empty ──────────────────

test('Given a transcript with only valid rollup lines and no --baseline flag, when main runs, then stderr is empty (no skipped count, no unreadable-baseline message)', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', transcriptDir], io);

  assert.equal(io.stderr.joined(), '', `expected empty stderr; got: ${io.stderr.joined()}`);
});

// ─── P29-15. writeFileSync throws for report.json → stderr note, exit 0 ──────

test('Given writeFileSync that throws EACCES for report.json, when main runs, then stderr notes the write failure and exits 0 without throwing', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const writeError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
  const mockWriteFileSync = (path, data, enc) => {
    if (typeof path === 'string' && path.endsWith('report.json')) throw writeError;
    writeFileSync(path, data, enc);
  };
  const io = makeIo({ projectsRoot, repoRoot, writeFileSync: mockWriteFileSync });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0);
  assert.ok(
    io.stderr.joined().includes('report write failed (EACCES)'),
    `stderr must note json write failure; got: ${io.stderr.joined()}`,
  );
  assert.ok(!existsSync(join(repoRoot, 'report.md')), 'report.md must not be written when json write failed');
});

// ─── P29-16. writeFileSync throws for report.md → stderr note, report.json written, exit 0 ──

test('Given writeFileSync that throws EACCES for report.md but succeeds for report.json, when main runs, then stderr notes the write failure, report.json exists, and exits 0', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const writeError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
  const mockWriteFileSync = (path, data, enc) => {
    if (typeof path === 'string' && path.endsWith('report.md')) throw writeError;
    writeFileSync(path, data, enc);
  };
  const io = makeIo({ projectsRoot, repoRoot, writeFileSync: mockWriteFileSync });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0);
  assert.ok(
    io.stderr.joined().includes('report write failed (EACCES)'),
    `stderr must note md write failure; got: ${io.stderr.joined()}`,
  );
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'report.json must still be written when only md write fails');
});

// ─── P29-17. per-file createReadStream error → file skipped, processing continues, exit 0 ──

test('Given two transcript files where createReadStream throws for one but succeeds for the other, when main runs, then the failing file is skipped and report has events from the successful file and exits 0', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'project');
  mkdirSync(transcriptDir);
  writeFileSync(join(transcriptDir, 'a-bad.jsonl'), ROLLUP_LINE + '\n', 'utf8');
  writeFileSync(join(transcriptDir, 'b-good.jsonl'), ROLLUP_LINE + '\n', 'utf8');
  const repoRoot = makeTmp('repo-');
  const streamError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
  const mockCreateReadStream = (path) => {
    if (typeof path === 'string' && path.endsWith('a-bad.jsonl')) throw streamError;
    return createReadStream(path);
  };
  const io = makeIo({ projectsRoot, repoRoot, createReadStream: mockCreateReadStream });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0);
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'report.json must exist');
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(report.runs.length > 0, 'report must have events from the successful file');
});

// ─── P29-18. loadJson readFileSync throws for --prices → defaults used, stderr note, exit 0 ──

test('Given a --prices path where readFileSync throws EACCES, when main runs, then defaults are used, stderr notes the unreadable file, and exits 0', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const pricesPath = join(repoRoot, 'prices.json');
  const readError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
  const mockReadFileSync = (path, enc) => {
    if (path === pricesPath) throw readError;
    return readFileSync(path, enc);
  };
  const io = makeIo({ projectsRoot, repoRoot, readFileSync: mockReadFileSync });

  const result = await sut(['--dir', transcriptDir, '--prices', pricesPath], io);

  assert.equal(result, 0);
  assert.ok(
    io.stderr.joined().includes('ignoring unreadable'),
    `stderr must note unreadable prices file; got: ${io.stderr.joined()}`,
  );
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'report.json must still be written with default prices');
});

// ─── phase-skip signal — auto-skip token in transcript → report rec ───────────

test('Given a transcript with a rollup and an auto-skip token, when main runs, then report.json carries a phase-skip recommendation', async () => {
  const sut = main;
  const autoSkipLine = JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-aaa',
    message: { role: 'assistant', content: [{ type: 'text', text: 'auto-skip: review — evaluated unnecessary (no source diff in scope)' }] },
  });
  const { projectsRoot, transcriptDir } = makeFixture({ lines: [ROLLUP_LINE, autoSkipLine] });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--dir', transcriptDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const skipRecs = report.recommendations.filter(r => r.kind === 'phase-skip');
  assert.deepEqual(skipRecs.map(r => r.phase), ['review']);
});

// ─── --source selector — default, opencode routing, unknown rejection ────────

test('Given no --source flag, when main runs on a claude fixture, then it routes to the claude binding unchanged and exits 0', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.runs.length, 1);
  assert.equal(report.runs[0].groups[0].model, 'claude-opus-4-8', 'default source must be the claude binding');
});

test('Given --source opencode with a fixture dir of opencode-format jsonl files, when main runs, then it routes to the opencode binding and the report reflects opencode-parsed events', async () => {
  const sut = main;
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot: OPENCODE_FIXTURES_ROOT, repoRoot });

  const result = await sut(['--source', 'opencode', '--dir', OPENCODE_FIXTURE_DIR], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(report.runs.length > 0, 'opencode fixtures must produce at least one run');
  const models = report.runs.flatMap(r => r.groups).map(g => g.model);
  assert.ok(
    models.includes('anthropic/claude-opus-4-8'),
    `report must reflect opencode-parsed events (opencode model ids carry an "anthropic/" prefix); got models: ${models}`,
  );
});

test('Given --source pi with a fixture dir of pi-format jsonl files, when main runs, then it routes to the pi binding and the report reflects pi-parsed events', async () => {
  const sut = main;
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot: OPENCODE_FIXTURES_ROOT, repoRoot });

  const result = await sut(['--source', 'pi', '--dir', PI_FIXTURE_DIR], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(report.runs.length > 0, 'pi fixtures must produce at least one run');
  const roles = report.runs.flatMap(r => r.groups).map(g => g.role);
  assert.ok(
    roles.every(role => role === null),
    `pi-parsed groups must carry a null role (pi has no subagent attribution); got roles: ${roles}`,
  );
  const runIds = report.runs.map(r => r.run);
  assert.ok(runIds.includes('pi-sess-aaa'), `report must reflect the pi session-header id; got: ${runIds}`);
});

test('Given PI_CODING_AGENT_SESSION_DIR is unset, when resolveDefaultReadRoot runs for source pi, then it resolves to the literal ~/.pi/agent/sessions path', () => {
  const sut = resolveDefaultReadRoot;
  const previousEnv = process.env[PI_SESSION_ENV_VAR];
  delete process.env[PI_SESSION_ENV_VAR];

  try {
    const result = sut('pi');

    assert.equal(result, join(homedir(), '.pi', 'agent', 'sessions'));
  } finally {
    if (previousEnv === undefined) delete process.env[PI_SESSION_ENV_VAR];
    else process.env[PI_SESSION_ENV_VAR] = previousEnv;
  }
});

test('Given --source pi with no io.projectsRoot override, when PI_CODING_AGENT_SESSION_DIR names a temp dir, then the pi default read root resolves to it while the claude default read root still rejects the same dir', async () => {
  const sut = main;
  const piSessionsDir = makeTmp('pi-sessions-');
  const transcriptDir = join(piSessionsDir, 'session-slug');
  mkdirSync(transcriptDir);
  writeFileSync(join(transcriptDir, 'transcript.jsonl'), readFileSync(join(PI_FIXTURE_DIR, 'single-run.jsonl'), 'utf8'), 'utf8');
  const previousEnv = process.env[PI_SESSION_ENV_VAR];
  process.env[PI_SESSION_ENV_VAR] = piSessionsDir;

  try {
    const piRepoRoot = makeTmp('repo-');
    const piIo = makeIo({ repoRoot: piRepoRoot });

    const piResult = await sut(['--source', 'pi', '--dir', transcriptDir], piIo);

    assert.equal(piResult, 0, `stderr: ${piIo.stderr.joined()}`);
    const piReport = JSON.parse(readFileSync(join(piRepoRoot, 'report.json'), 'utf8'));
    assert.ok(
      piReport.runs.length > 0,
      `the pi default read root must resolve inside PI_CODING_AGENT_SESSION_DIR and pass containment; got: ${JSON.stringify(piReport)}`,
    );

    const claudeRepoRoot = makeTmp('repo-');
    const claudeIo = makeIo({ repoRoot: claudeRepoRoot });

    const claudeResult = await sut(['--source', 'claude', '--dir', transcriptDir], claudeIo);

    assert.equal(claudeResult, 0, `stderr: ${claudeIo.stderr.joined()}`);
    const claudeReport = JSON.parse(readFileSync(join(claudeRepoRoot, 'report.json'), 'utf8'));
    assert.equal(
      claudeReport.note,
      'transcript dir not contained within projects root',
      'the same dir must fail containment under the unchanged claude default read root',
    );
  } finally {
    if (previousEnv === undefined) delete process.env[PI_SESSION_ENV_VAR];
    else process.env[PI_SESSION_ENV_VAR] = previousEnv;
  }
});

test('Given COPILOT_OTEL_FILE_EXPORTER_PATH is unset, when resolveDefaultReadRoot runs for source copilot, then it resolves to the literal ~/.copilot/otel path', () => {
  const sut = resolveDefaultReadRoot;
  const previousEnv = process.env[COPILOT_OTEL_ENV_VAR];
  delete process.env[COPILOT_OTEL_ENV_VAR];

  try {
    const result = sut('copilot');

    assert.equal(result, join(homedir(), '.copilot', 'otel'));
  } finally {
    if (previousEnv === undefined) delete process.env[COPILOT_OTEL_ENV_VAR];
    else process.env[COPILOT_OTEL_ENV_VAR] = previousEnv;
  }
});

test('Given COPILOT_OTEL_FILE_EXPORTER_PATH names a file, when resolveDefaultReadRoot runs for source copilot, then it resolves to that file\'s containing directory', () => {
  const sut = resolveDefaultReadRoot;
  const previousEnv = process.env[COPILOT_OTEL_ENV_VAR];
  process.env[COPILOT_OTEL_ENV_VAR] = '/some/dir/otel.jsonl';

  try {
    const result = sut('copilot');

    assert.equal(result, '/some/dir');
  } finally {
    if (previousEnv === undefined) delete process.env[COPILOT_OTEL_ENV_VAR];
    else process.env[COPILOT_OTEL_ENV_VAR] = previousEnv;
  }
});

test('Given the read root is resolved, when COPILOT_OTEL_FILE_EXPORTER_PATH changes and it is resolved again, then the second result reflects the new value', () => {
  const sut = resolveDefaultReadRoot;
  const previousEnv = process.env[COPILOT_OTEL_ENV_VAR];
  process.env[COPILOT_OTEL_ENV_VAR] = '/first/dir/otel.jsonl';

  try {
    const firstResult = sut('copilot');

    process.env[COPILOT_OTEL_ENV_VAR] = '/second/dir/otel.jsonl';
    const secondResult = sut('copilot');

    assert.notEqual(firstResult, secondResult, 'a module-load-frozen default would not observe the env mutation');
    assert.equal(firstResult, '/first/dir');
    assert.equal(secondResult, '/second/dir');
  } finally {
    if (previousEnv === undefined) delete process.env[COPILOT_OTEL_ENV_VAR];
    else process.env[COPILOT_OTEL_ENV_VAR] = previousEnv;
  }
});

test('Given COPILOT_OTEL_FILE_EXPORTER_PATH set to the empty string, when resolveDefaultReadRoot runs for source copilot, then it falls back to the default root', () => {
  const sut = resolveDefaultReadRoot;
  const previousEnv = process.env[COPILOT_OTEL_ENV_VAR];
  process.env[COPILOT_OTEL_ENV_VAR] = '';

  try {
    const result = sut('copilot');

    assert.equal(result, join(homedir(), '.copilot', 'otel'));
  } finally {
    if (previousEnv === undefined) delete process.env[COPILOT_OTEL_ENV_VAR];
    else process.env[COPILOT_OTEL_ENV_VAR] = previousEnv;
  }
});

for (const reserved of ['__proto__', 'constructor', 'hasOwnProperty']) {
  test(`Given the inherited-member source "${reserved}", when resolveDefaultReadRoot runs, then it falls back to the claude default rather than resolving an inherited member`, () => {
    const sut = resolveDefaultReadRoot;

    const result = sut(reserved);

    assert.equal(result, join(homedir(), '.claude', 'projects'));
  });
}

test('Given --source copilot with no io.projectsRoot override and the env naming a temp OTel file, when main runs, then it mines the fixture directory and exits 0', async () => {
  const sut = main;
  const otelDir = makeTmp('copilot-otel-');
  const otelFile = join(otelDir, 'otel.jsonl');
  writeFileSync(otelFile, readFileSync(join(COPILOT_FIXTURE_DIR, 'single-chat.jsonl'), 'utf8'), 'utf8');
  const previousEnv = process.env[COPILOT_OTEL_ENV_VAR];
  process.env[COPILOT_OTEL_ENV_VAR] = otelFile;

  try {
    const repoRoot = makeTmp('repo-');
    const io = makeIo({ repoRoot });

    const result = await sut(['--source', 'copilot'], io);

    assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
    const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
    assert.ok(report.runs.length > 0, 'copilot fixture must produce at least one run');
    const tokens = report.runs.flatMap(r => r.groups).map(g => g.tokens);
    assert.ok(
      tokens.some(t => t.input === 42 && t.output === 17),
      `report must reflect the copilot-parsed chat span's token totals; got: ${JSON.stringify(tokens)}`,
    );
  } finally {
    if (previousEnv === undefined) delete process.env[COPILOT_OTEL_ENV_VAR];
    else process.env[COPILOT_OTEL_ENV_VAR] = previousEnv;
  }
});

test('Given --source copilot, when main runs, then it is accepted rather than rejected as a config error', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture({ lines: [readFileSync(join(COPILOT_FIXTURE_DIR, 'single-chat.jsonl'), 'utf8').trim()] });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--source', 'copilot', '--dir', transcriptDir], io);

  assert.equal(result, 0, `--source copilot must be accepted, not rejected as a config error; stderr: ${io.stderr.joined()}`);
});

test('Given an unknown --source value, when main runs, then it exits non-zero, writes a stderr message, and writes no report before the rejection', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--source', 'bogus', '--dir', transcriptDir], io);

  assert.notEqual(result, 0, 'unknown --source must be a non-zero exit');
  assert.ok(io.stderr.joined().includes('bogus'), `stderr must name the unknown source; got: ${io.stderr.joined()}`);
  assert.ok(!existsSync(join(repoRoot, 'report.json')), 'no report may be written before the --source rejection');
});

test('Given an unknown --source value, when main runs, then the stderr message lists the valid sources joined by a pipe', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--source', 'bogus', '--dir', transcriptDir], io);

  // A real adjacent list-pair (not a single-token includes) pins the '|' separator:
  // a join("") mutant would produce "claudeopencode" and fail this assertion.
  assert.ok(
    io.stderr.joined().includes('claude|opencode'),
    `stderr must join valid sources with '|'; got: ${io.stderr.joined()}`,
  );
});

for (const reserved of ['__proto__', 'constructor', 'hasOwnProperty']) {
  test(`Given the inherited-member --source "${reserved}", when main runs, then it is rejected non-zero before any I/O (own-property gate)`, async () => {
    const sut = main;
    const { projectsRoot, transcriptDir } = makeFixture();
    const repoRoot = makeTmp('repo-');
    const io = makeIo({ projectsRoot, repoRoot });

    const result = await sut(['--source', reserved, '--dir', transcriptDir], io);

    assert.notEqual(result, 0, `--source ${reserved} must not resolve an inherited member to a truthy parser`);
    assert.ok(!existsSync(join(repoRoot, 'report.json')), 'no report may be written before the reserved-key rejection');
  });
}
