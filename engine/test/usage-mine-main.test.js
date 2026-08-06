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
  readdirSync,
  createReadStream,
  rmSync,
  mkdirSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  main,
  resolveDefaultReadRoot,
  resolveSourceFilter,
  resolveFileMatcher,
  resolveFileLabel,
  dashedCwd,
  resolveDefaultTranscriptDir,
} from '../src/observability/usage-mine-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';
import { containByRealpath } from '../src/contain.js';
import { serializeReport } from '../src/observability/usage-aggregate.js';

const OPENCODE_FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const OPENCODE_FIXTURE_DIR = join(OPENCODE_FIXTURES_ROOT, 'opencode');
const PI_FIXTURE_DIR = join(OPENCODE_FIXTURES_ROOT, 'pi');
const PI_SESSION_ENV_VAR = 'PI_CODING_AGENT_SESSION_DIR';
const COPILOT_FIXTURE_DIR = join(OPENCODE_FIXTURES_ROOT, 'copilot');
const COPILOT_OTEL_ENV_VAR = 'COPILOT_OTEL_FILE_EXPORTER_PATH';
const CODEX_FIXTURE_DIR = join(OPENCODE_FIXTURES_ROOT, 'codex');
const CODEX_HOME_ENV_VAR = 'CODEX_HOME';
const AIDER_FIXTURE_DIR = join(OPENCODE_FIXTURES_ROOT, 'aider');
const AIDER_HISTORY_FILENAME = '.aider.chat.history.md';

// A spawn-rollup JSONL line: a 'user' line carrying toolUseResult, no message.usage.
// Kept only where a test's point is that a rollup contributes nothing — the emission
// rule reads message.usage exclusively, so this shape never yields an event.
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

// A main-loop assistant usage line — carries the same token numbers as ROLLUP_LINE
// so the drift-fixture arithmetic in the §6b block still lines up (group total
// 2 + 196062 + 255 + 900 = 197219). This is makeFixture's default: the emission
// rule reads message.usage, and a 'user'-role rollup line no longer produces one.
const MAIN_USAGE_LINE = JSON.stringify({
  type: 'assistant',
  sessionId: 'sess-aaa',
  slug: 'feature-x',
  timestamp: '2026-01-01T00:00:00.000Z',
  message: {
    role: 'assistant',
    model: 'claude-opus-4-8',
    usage: {
      input_tokens: 2,
      cache_read_input_tokens: 196062,
      cache_creation_input_tokens: 255,
      output_tokens: 900,
      cache_creation: { ephemeral_5m_input_tokens: 255, ephemeral_1h_input_tokens: 0 },
    },
  },
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
function makeFixture({ lines = [MAIN_USAGE_LINE] } = {}) {
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

/**
 * Build a two-level claude project tree: <root>/proj/<sessionId>.jsonl
 * (main-loop) plus <root>/proj/<sessionId>/subagents/agent-<id>.jsonl (+
 * sidecar). Returns { projectsRoot, transcriptDir } — transcriptDir is the
 * project dir, exactly what --dir points a discovery walk's root listing at.
 */
function makeClaudeProjectFixture({ sessionId = 'sess-x', mainLines = [], subagents = [] } = {}) {
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'proj');
  mkdirSync(transcriptDir);
  if (mainLines.length) {
    writeFileSync(join(transcriptDir, `${sessionId}.jsonl`), mainLines.join('\n') + '\n', 'utf8');
  }
  if (subagents.length) {
    const subagentsDir = join(transcriptDir, sessionId, 'subagents');
    mkdirSync(subagentsDir, { recursive: true });
    for (const { id, lines, sidecar } of subagents) {
      writeFileSync(join(subagentsDir, `agent-${id}.jsonl`), lines.join('\n') + '\n', 'utf8');
      if (sidecar !== undefined) writeFileSync(join(subagentsDir, `agent-${id}.meta.json`), sidecar, 'utf8');
    }
  }
  return { projectsRoot, transcriptDir, sessionId };
}

// A sub-agent assistant usage line — real field names, hand-chosen small numbers.
function subagentAssistantLine({ sessionId, timestamp = '2026-01-01T00:05:00.000Z', input = 5, output = 5 }) {
  return JSON.stringify({
    type: 'assistant',
    sessionId,
    timestamp,
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: input, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: output },
    },
  });
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
        phase: null, role: 'main-loop', model: 'claude-opus-4-8',
        tokens, durationMs: 0, messages: 1, cacheEfficiency: 0,
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
    report.drift.some(d => d.phase === null && d.dimension === 'tokens-total'),
    'default threshold must flag the main-loop group token-total drift'
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

test('Given a --prices override file with per-MTok rates, when main runs, then the report prices the override in dollars: Σ(class × overrideRate) / 1e6', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const pricesOverride = { 'claude-opus-4-8': { input: 100, output: 200, cacheRead: 10, cacheCreation5m: 20, cacheCreation1h: 30 } };
  const pricesPath = join(repoRoot, 'prices.json');
  writeFileSync(pricesPath, JSON.stringify(pricesOverride), 'utf8');

  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir, '--prices', pricesPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const totalCost = report.runs.flatMap(r => r.groups).reduce((s, g) => s + (g.cost.priced ?? 0), 0);
  // MAIN_USAGE_LINE tokens: input=2, cacheRead=196062, cacheCreation split {5m:255, 1h:0}, output=900.
  // Σ = 2*100 + 196062*10 + (255*20 + 0*30) + 900*200 = 200 + 1,960,620 + 5,100 + 180,000 = 2,145,920
  const expected = (2 * 100 + 196062 * 10 + (255 * 20 + 0 * 30) + 900 * 200) / 1e6;
  assert.equal(totalCost, expected, 'a per-MTok override entry must price in dollars — this breaks if the divisor is ever pushed into priceEntry');
});

// ─── 8. main-loop inclusion is default-on — an inline-only dir now yields events ──

test('Given a dir of only main-loop assistant usage lines and no flags, when main runs, then the report carries a non-empty main-loop run (main-loop inclusion is default-on)', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture({ lines: [INLINE_LINE] });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(report.runs.length > 0, 'runs must be non-empty — main-loop turns are events now');
  assert.equal(report.runs[0].groups[0].role, 'main-loop');
});

test('Given a dir of only main-loop assistant usage lines, when main runs with default flags, then the report carries exactly one role: main-loop, phase: null group with the exact token total', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const mainLoopGroups = report.runs.flatMap(r => r.groups).filter(g => g.role === 'main-loop');
  assert.equal(mainLoopGroups.length, 1, 'exactly one main-loop group, no per-phase split');
  assert.equal(mainLoopGroups[0].phase, null);
  const { input, cacheRead, cacheCreation, output } = mainLoopGroups[0].tokens;
  // MAIN_USAGE_LINE token total: 2 + 196062 + 255 + 900 = 197219.
  assert.equal(input + cacheRead + cacheCreation + output, 197219);
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

// ─── --no-inline drops main-loop EVENTS but never main-loop MARKERS ──────────

test('Given a session with a main-loop usage line, an auto-skip marker, and a sub-agent transcript, when main runs with --no-inline, then the main-loop group is dropped but the sub-agent group and the auto-skip recommendation survive', async () => {
  const sut = main;
  const sessionId = 'sess-noinline';
  const mainLine = JSON.stringify({
    type: 'assistant', sessionId, slug: 'feature-x', timestamp: '2026-01-01T00:00:00.000Z',
    message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 900 } },
  });
  // auto-skip: tokens ride in orchestrator assistant text — a marker line, not a usage line.
  const autoSkipLine = JSON.stringify({
    type: 'assistant',
    sessionId,
    message: { role: 'assistant', content: [{ type: 'text', text: 'auto-skip: review — evaluated unnecessary (no source diff in scope)' }] },
  });
  const { projectsRoot, transcriptDir } = makeClaudeProjectFixture({
    sessionId,
    mainLines: [mainLine, autoSkipLine],
    subagents: [{ id: '1', lines: [subagentAssistantLine({ sessionId })], sidecar: JSON.stringify({ agentType: 'craft:designer' }) }],
  });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir, '--no-inline'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const roles = report.runs.flatMap(r => r.groups).map(g => g.role);
  assert.ok(!roles.includes('main-loop'), `--no-inline must drop the main-loop group; got roles: ${roles}`);
  assert.ok(roles.includes('designer'), `the sub-agent group must survive --no-inline; got roles: ${roles}`);
  const skipRecs = report.recommendations.filter(r => r.kind === 'phase-skip');
  assert.deepEqual(skipRecs.map(r => r.phase), ['review'], '--no-inline must not drop the auto-skip marker');
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

// ─── P29-2. no-files dir note names the per-source filename ──────────────────

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

test('Given an empty transcript dir, when main runs with --source aider, then the report note names the aider history filename', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const emptyDir = join(projectsRoot, 'empty-project');
  mkdirSync(emptyDir);
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--source', 'aider', '--dir', emptyDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(
    report.note,
    'no .aider.chat.history.md transcript files found',
    'note must name the aider history filename, not the default .jsonl wording',
  );
});

test('Given an empty transcript dir, when main runs with --source codex, then the report note keeps the .jsonl wording', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const emptyDir = join(projectsRoot, 'empty-project');
  mkdirSync(emptyDir);
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--source', 'codex', '--dir', emptyDir], io);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(
    report.note,
    'no .jsonl transcript files found',
    'codex has no dedicated matcher entry, so the note must keep the default .jsonl wording',
  );
});

// ─── P29-3. --since filters events by timestamp ──────────────────────────────

test('Given two assistant usage lines with timestamps before and after a --since cutoff, when main runs with --since, then only the later event appears in the report', async () => {
  const sut = main;
  const BEFORE = JSON.stringify({
    type: 'assistant', sessionId: 'sess-before', slug: 'f', timestamp: '2026-01-01T00:00:00.000Z',
    message: {
      role: 'assistant', model: 'claude-sonnet-4-6',
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const AFTER = JSON.stringify({
    type: 'assistant', sessionId: 'sess-after', slug: 'f', timestamp: '2026-06-01T00:00:00.000Z',
    message: {
      role: 'assistant', model: 'claude-sonnet-4-6',
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

test('Given a transcript dir containing both a .jsonl usage file and a .txt file, when main runs, then only the .jsonl file is processed', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'project');
  mkdirSync(transcriptDir);
  writeFileSync(join(transcriptDir, 'transcript.jsonl'), MAIN_USAGE_LINE + '\n', 'utf8');
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
  writeFileSync(join(transcriptDir, 'a-bad.jsonl'), MAIN_USAGE_LINE + '\n', 'utf8');
  writeFileSync(join(transcriptDir, 'b-good.jsonl'), MAIN_USAGE_LINE + '\n', 'utf8');
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

// ─── Sub-agent transcript discovery — the front-door wiring of discover() ────

// The regression this whole change exists to prevent: a rollup line (never read
// for tokens — the emission rule reads only message.usage) totals 1,000; the
// sub-agent transcript it spawned totals 100,000. Truth is 100,000 — not 1,000
// (today's under-report) and not 101,000 (a double-count of both sources).
test('Given a session whose main-loop file carries a rollup and whose sub-agent transcript carries real usage, when main runs, then the relative cost total is the sub-agent total exactly — not the rollup total, not the sum of both', async () => {
  const sut = main;
  const sessionId = 'sess-100x';
  const rollupLine = JSON.stringify({
    type: 'user',
    sessionId,
    timestamp: '2026-01-01T00:00:00.000Z',
    toolUseResult: {
      agentType: 'craft:designer',
      resolvedModel: 'claude-opus-4-8',
      totalDurationMs: 1000,
      totalTokens: 1000,
      usage: { input_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
    },
    isSidechain: false,
  });
  const subagentLine = subagentAssistantLine({ sessionId, input: 100000, output: 0 });
  const { projectsRoot, transcriptDir } = makeClaudeProjectFixture({
    sessionId,
    mainLines: [rollupLine],
    subagents: [{ id: '1', lines: [subagentLine], sidecar: JSON.stringify({ agentType: 'craft:designer' }) }],
  });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const totalRelative = report.runs.flatMap(r => r.groups).reduce((s, g) => s + g.cost.relative, 0);
  assert.equal(totalRelative, 100000, `expected the sub-agent total 100000; got ${totalRelative}`);
  assert.notEqual(totalRelative, 1000, 'must not silently read only the rollup (the original defect)');
  assert.notEqual(totalRelative, 101000, 'must not double-count the rollup alongside the sub-agent transcript');
});

test('Given a sub-agent transcript labelled by its sidecar, when main runs, then the group carries the sidecar-resolved role and phase', async () => {
  const sut = main;
  const sessionId = 'sess-role';
  const { projectsRoot, transcriptDir } = makeClaudeProjectFixture({
    sessionId,
    subagents: [{ id: '1', lines: [subagentAssistantLine({ sessionId })], sidecar: JSON.stringify({ agentType: 'craft:reviewer' }) }],
  });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const groups = report.runs.flatMap(r => r.groups);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].role, 'reviewer');
  assert.equal(groups[0].phase, 'review');
});

test('Given a sub-agent transcript with no sidecar file, when main runs, then the group carries role: null and stderr reports it as unlabelled', async () => {
  const sut = main;
  const sessionId = 'sess-nosidecar';
  const { projectsRoot, transcriptDir } = makeClaudeProjectFixture({
    sessionId,
    subagents: [{ id: 'orphan', lines: [subagentAssistantLine({ sessionId })] }],
  });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stderr.joined().includes('transcript(s) with no resolvable agent label'),
    `stderr must note the unlabelled transcript; got: ${io.stderr.joined()}`,
  );
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const roles = report.runs.flatMap(r => r.groups).map(g => g.role);
  assert.ok(roles.includes(null), `the no-sidecar sub-agent group must carry role: null; got: ${roles}`);
});

test('Given a session whose subagents directory is named in its parent listing but cannot itself be listed, when main runs, then that session contributes no sub-agent entries, stderr counts it as unreadable, and exit is 0', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'proj');
  mkdirSync(transcriptDir);
  writeFileSync(join(transcriptDir, 'sess-good.jsonl'), MAIN_USAGE_LINE + '\n', 'utf8');
  const unreadableSubagentsDir = join(transcriptDir, 'sess-unreadable', 'subagents');
  mkdirSync(unreadableSubagentsDir, { recursive: true });
  writeFileSync(join(unreadableSubagentsDir, 'agent-1.jsonl'), subagentAssistantLine({ sessionId: 'sess-unreadable' }) + '\n', 'utf8');
  const repoRoot = makeTmp('repo-');
  const eaccesError = Object.assign(new Error('EACCES'), { code: 'EACCES' });
  const mockReaddirSync = (p, ...rest) => {
    if (typeof p === 'string' && p.endsWith(join('sess-unreadable', 'subagents'))) throw eaccesError;
    return readdirSync(p, ...rest);
  };
  const io = makeIo({ projectsRoot, repoRoot, readdirSync: mockReaddirSync });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stderr.joined().includes('1 unreadable sub-agent directory'),
    `stderr must count the unreadable dir; got: ${io.stderr.joined()}`,
  );
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const roles = report.runs.flatMap(r => r.groups).map(g => g.role);
  assert.ok(!roles.some(r => r !== 'main-loop'), `the unreadable session must contribute no sub-agent group; got: ${roles}`);
});

test('Given a subagents directory that is a symlink escaping the read root, when main runs, then that session contributes no sub-agent entries, stderr counts it as unreadable, and exit is 0', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const transcriptDir = join(projectsRoot, 'proj');
  mkdirSync(transcriptDir);
  writeFileSync(join(transcriptDir, 'sess-good.jsonl'), MAIN_USAGE_LINE + '\n', 'utf8');
  const sessionDir = join(transcriptDir, 'sess-escape');
  mkdirSync(sessionDir, { recursive: true });
  const outsideTarget = makeTmp('outside-subagents-');
  writeFileSync(join(outsideTarget, 'agent-1.jsonl'), subagentAssistantLine({ sessionId: 'sess-escape' }) + '\n', 'utf8');
  symlinkSync(outsideTarget, join(sessionDir, 'subagents'));
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stderr.joined().includes('1 unreadable sub-agent directory'),
    `a symlink escape must be refused and counted as unreadable, never followed; got: ${io.stderr.joined()}`,
  );
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const roles = report.runs.flatMap(r => r.groups).map(g => g.role);
  assert.ok(!roles.some(r => r !== 'main-loop'), `the escaping symlink must not surface any sub-agent group; got: ${roles}`);
});

test('Given a main-loop event carrying a slug and a slug-less sub-agent event sharing its run, when main runs, then the run inherits the main-loop slug', async () => {
  const sut = main;
  const sessionId = 'sess-slug';
  const mainLine = JSON.stringify({
    type: 'assistant', sessionId, slug: 'feature-slug', timestamp: '2026-01-01T00:00:00.000Z',
    message: { role: 'assistant', model: 'claude-opus-4-8', usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 } },
  });
  const { projectsRoot, transcriptDir } = makeClaudeProjectFixture({
    sessionId,
    mainLines: [mainLine],
    subagents: [{ id: '1', lines: [subagentAssistantLine({ sessionId })], sidecar: JSON.stringify({ agentType: 'craft:designer' }) }],
  });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.equal(report.runs.length, 1);
  assert.equal(report.runs[0].slug, 'feature-slug', 'the sub-agent group\'s run must inherit the main-loop slug');
  const roles = report.runs[0].groups.map(g => g.role);
  assert.ok(roles.includes('designer'), `the sub-agent group must be present in the same run; got: ${roles}`);
});

// ─── Zero-arg read root: dashedCwd + resolveDefaultTranscriptDir ─────────────

test('Given a plain absolute cwd, when dashedCwd runs, then every path separator becomes a dash', () => {
  const sut = dashedCwd;

  const result = sut('/Users/scolladon/workspace/perso/craft');

  assert.equal(result, '-Users-scolladon-workspace-perso-craft');
});

test('Given a cwd containing a dot, when dashedCwd runs, then the dot also becomes a dash', () => {
  const sut = dashedCwd;

  // Verified live: a scratchpad path nested under an already-dashed segment
  // produces a doubled dash. No path on this box contains a '.', so the dot
  // rule itself is asserted directly rather than reproduced from a live path.
  const result = sut('/private/tmp/claude-501/-Users-x-craft/sub.dir/scratchpad');

  assert.equal(result, '-private-tmp-claude-501--Users-x-craft-sub-dir-scratchpad');
});

test('Given source claude, when resolveDefaultTranscriptDir runs, then it joins the projects root with the dashed cwd', () => {
  const sut = resolveDefaultTranscriptDir;

  const result = sut('claude', '/root', '/a/b');

  assert.equal(result, join('/root', '-a-b'));
});

test('Given a non-claude source, when resolveDefaultTranscriptDir runs, then it resolves to the root unchanged', () => {
  const sut = resolveDefaultTranscriptDir;

  const result = sut('opencode', '/root', '/a/b');

  assert.equal(result, '/root');
});

test('Given no --dir flag, when main runs with an injected cwd, then it resolves the transcript dir under the dashed cwd inside the default projects root', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const cwd = '/some/project/path';
  const dashedDir = join(projectsRoot, dashedCwd(cwd));
  mkdirSync(dashedDir, { recursive: true });
  writeFileSync(join(dashedDir, 'sess-zero.jsonl'), MAIN_USAGE_LINE + '\n', 'utf8');
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot, cwd });

  const result = await sut([], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(report.runs.length > 0, 'the zero-arg run must resolve the dashed-cwd directory and mine it');
});

test('Given the default transcript dir resolves under one project, when main runs with --dir pointing at a different project under the same root, then containment still accepts it (the containment root did not shrink)', async () => {
  const sut = main;
  const projectsRoot = makeTmp('projects-');
  const cwd = '/some/other/project';
  const otherProjectDir = join(projectsRoot, 'another-project');
  mkdirSync(otherProjectDir, { recursive: true });
  writeFileSync(join(otherProjectDir, 'sess-other.jsonl'), MAIN_USAGE_LINE + '\n', 'utf8');
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot, cwd });

  const result = await sut(['--dir', otherProjectDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(report.runs.length > 0, 'an explicit --dir at a different project under the unchanged containment root must still be accepted');
});

// ─── phase-skip signal — auto-skip token in transcript → report rec ───────────

test('Given a transcript with a usage event and an auto-skip token, when main runs, then report.json carries a phase-skip recommendation', async () => {
  const sut = main;
  const autoSkipLine = JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-aaa',
    message: { role: 'assistant', content: [{ type: 'text', text: 'auto-skip: review — evaluated unnecessary (no source diff in scope)' }] },
  });
  // A no-op run (zero events) skips recommendation computation entirely, so this
  // needs a genuine usage event alongside the marker line, not just a rollup.
  const { projectsRoot, transcriptDir } = makeFixture({ lines: [MAIN_USAGE_LINE, autoSkipLine] });
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

// ─── --source codex — routing, read-root thunk, unknown-source listing ──────

test('Given --source codex, when main runs, then it is accepted rather than rejected as a config error', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture({ lines: [readFileSync(join(CODEX_FIXTURE_DIR, 'single-turn.jsonl'), 'utf8').trim()] });
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--source', 'codex', '--dir', transcriptDir], io);

  assert.equal(result, 0, `--source codex must be accepted, not rejected as a config error; stderr: ${io.stderr.joined()}`);
});

test('Given --source codex over a rollout fixture, when main runs, then the written report carries the turn\'s tokens', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture({ lines: [readFileSync(join(CODEX_FIXTURE_DIR, 'single-turn.jsonl'), 'utf8').trim()] });
  const repoRoot = makeTmp('repo-');
  // An explicit io.projectsRoot override always wins over resolveDefaultReadRoot,
  // dodging the containment trap: the codex default read root is $CODEX_HOME/sessions,
  // and this fixture dir is not inside it.
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--source', 'codex', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(report.runs.length > 0, 'codex fixture must produce at least one run');
  const tokens = report.runs.flatMap(r => r.groups).map(g => g.tokens);
  assert.ok(
    tokens.some(t => t.input === 80 && t.output === 55),
    `report must reflect the codex-parsed turn's token totals; got: ${JSON.stringify(tokens)}`,
  );
});

test('Given CODEX_HOME is set, when resolveDefaultReadRoot runs for source codex, then it resolves under that home\'s sessions directory', () => {
  const sut = resolveDefaultReadRoot;
  const previousEnv = process.env[CODEX_HOME_ENV_VAR];
  process.env[CODEX_HOME_ENV_VAR] = '/custom/codex-home';

  try {
    const result = sut('codex');

    assert.equal(result, join('/custom/codex-home', 'sessions'));
  } finally {
    if (previousEnv === undefined) delete process.env[CODEX_HOME_ENV_VAR];
    else process.env[CODEX_HOME_ENV_VAR] = previousEnv;
  }
});

test('Given CODEX_HOME is unset, when resolveDefaultReadRoot runs for source codex, then it resolves to the literal ~/.codex/sessions path', () => {
  const sut = resolveDefaultReadRoot;
  const previousEnv = process.env[CODEX_HOME_ENV_VAR];
  delete process.env[CODEX_HOME_ENV_VAR];

  try {
    const result = sut('codex');

    assert.equal(result, join(homedir(), '.codex', 'sessions'));
  } finally {
    if (previousEnv === undefined) delete process.env[CODEX_HOME_ENV_VAR];
    else process.env[CODEX_HOME_ENV_VAR] = previousEnv;
  }
});

test('Given CODEX_HOME set to the empty string, when resolveDefaultReadRoot runs for source codex, then it falls back to the default root', () => {
  const sut = resolveDefaultReadRoot;
  const previousEnv = process.env[CODEX_HOME_ENV_VAR];
  process.env[CODEX_HOME_ENV_VAR] = '';

  try {
    const result = sut('codex');

    assert.equal(result, join(homedir(), '.codex', 'sessions'));
  } finally {
    if (previousEnv === undefined) delete process.env[CODEX_HOME_ENV_VAR];
    else process.env[CODEX_HOME_ENV_VAR] = previousEnv;
  }
});

test('Given CODEX_HOME changes between two calls, when resolveDefaultReadRoot runs each time for source codex, then each call reflects the current value', () => {
  const sut = resolveDefaultReadRoot;
  const previousEnv = process.env[CODEX_HOME_ENV_VAR];
  process.env[CODEX_HOME_ENV_VAR] = '/first/codex-home';

  try {
    const firstResult = sut('codex');

    process.env[CODEX_HOME_ENV_VAR] = '/second/codex-home';
    const secondResult = sut('codex');

    assert.notEqual(firstResult, secondResult, 'a module-load-frozen default would not observe the env mutation');
    assert.equal(firstResult, join('/first/codex-home', 'sessions'));
    assert.equal(secondResult, join('/second/codex-home', 'sessions'));
  } finally {
    if (previousEnv === undefined) delete process.env[CODEX_HOME_ENV_VAR];
    else process.env[CODEX_HOME_ENV_VAR] = previousEnv;
  }
});

test('Given an unknown --source value, when main runs, then the expected-source list names codex', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--source', 'nope', '--dir', transcriptDir], io);

  assert.ok(
    io.stderr.joined().includes('codex'),
    `stderr must name codex among the expected sources; got: ${io.stderr.joined()}`,
  );
});

// ─── --source aider — routing, read-root thunk, file matcher, unknown-source listing ──

function makeAiderTranscriptDir() {
  const transcriptDir = makeTmp('aider-project-');
  const historyContent = readFileSync(join(AIDER_FIXTURE_DIR, 'real-session.md'), 'utf8');
  writeFileSync(join(transcriptDir, AIDER_HISTORY_FILENAME), historyContent, 'utf8');
  return transcriptDir;
}

test('Given --source aider, when main runs, then it is accepted rather than rejected as a config error', async () => {
  const sut = main;
  const transcriptDir = makeAiderTranscriptDir();
  const projectsRoot = dirname(transcriptDir);
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--source', 'aider', '--dir', transcriptDir], io);

  assert.equal(result, 0, `--source aider must be accepted, not rejected as a config error; stderr: ${io.stderr.joined()}`);
});

test('Given --source aider over a real-session fixture, when main runs, then the written report carries the session\'s tokens', async () => {
  const sut = main;
  const transcriptDir = makeAiderTranscriptDir();
  const projectsRoot = dirname(transcriptDir);
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--source', 'aider', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  assert.ok(report.runs.length > 0, 'aider fixture must produce at least one run');
  const tokens = report.runs.flatMap(r => r.groups).map(g => g.tokens);
  assert.ok(
    tokens.some(t => t.input === 781 && t.output === 19),
    `report must reflect the aider-parsed session's token totals; got: ${JSON.stringify(tokens)}`,
  );
});

test('Given source aider, when resolveDefaultReadRoot runs, then it resolves to process.cwd()', () => {
  const sut = resolveDefaultReadRoot;

  const result = sut('aider');

  assert.equal(result, process.cwd());
});

test('Given an unknown --source value, when main runs, then the expected-source list names aider', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = makeFixture();
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--source', 'nope', '--dir', transcriptDir], io);

  assert.ok(
    io.stderr.joined().includes('aider'),
    `stderr must name aider among the expected sources; got: ${io.stderr.joined()}`,
  );
});

// ─── resolveSourceFilter — per-source { match, label } pair ──────────────────

test('Given source aider, when resolveSourceFilter runs, then it returns the aider matcher paired with the aider label', () => {
  const sut = resolveSourceFilter;

  const { match, label } = sut('aider');

  assert.equal(match('.aider.chat.history.md'), true);
  assert.equal(label, '.aider.chat.history.md');
});

test('Given source claude, when resolveSourceFilter runs, then it returns the default matcher paired with the default label', () => {
  const sut = resolveSourceFilter;

  const { match, label } = sut('claude');

  assert.equal(match('x.jsonl'), true);
  assert.equal(label, '.jsonl');
});

test('Given the inherited-member source "constructor", when resolveSourceFilter runs, then it falls back to the default pair rather than resolving an inherited member', () => {
  const sut = resolveSourceFilter;

  const { match, label } = sut('constructor');

  assert.equal(match('x.jsonl'), true);
  assert.equal(match('.aider.chat.history.md'), false);
  assert.equal(label, '.jsonl');
});

// ─── resolveFileMatcher — per-source discovery filter ────────────────────────

test('Given source aider, when resolveFileMatcher runs, then the matcher accepts the exact aider history filename', () => {
  const sut = resolveFileMatcher;

  const matcher = sut('aider');

  assert.equal(matcher('.aider.chat.history.md'), true);
});

test('Given source aider, when resolveFileMatcher runs, then the matcher rejects a .jsonl filename', () => {
  const sut = resolveFileMatcher;

  const matcher = sut('aider');

  assert.equal(matcher('x.jsonl'), false);
});

test('Given source claude, when resolveFileMatcher runs, then the matcher accepts a .jsonl filename', () => {
  const sut = resolveFileMatcher;

  const matcher = sut('claude');

  assert.equal(matcher('x.jsonl'), true);
});

test('Given the inherited-member source "constructor", when resolveFileMatcher runs, then it falls back to the default .jsonl matcher rather than resolving an inherited member', () => {
  const sut = resolveFileMatcher;

  const matcher = sut('constructor');

  assert.equal(matcher('x.jsonl'), true);
  assert.equal(matcher('.aider.chat.history.md'), false);
});

// ─── resolveFileLabel — per-source discovery-filter label ────────────────────

test('Given source aider, when resolveFileLabel runs, then it returns the aider history filename', () => {
  const sut = resolveFileLabel;

  const label = sut('aider');

  assert.equal(label, '.aider.chat.history.md');
});

test('Given source claude, when resolveFileLabel runs, then it returns the default .jsonl label', () => {
  const sut = resolveFileLabel;

  const label = sut('claude');

  assert.equal(label, '.jsonl');
});

test('Given the inherited-member source "constructor", when resolveFileLabel runs, then it falls back to the default .jsonl label rather than resolving an inherited member', () => {
  const sut = resolveFileLabel;

  const label = sut('constructor');

  assert.equal(label, '.jsonl');
});

test('Given a mixed transcript dir with both the aider history file and a stray .jsonl file, when main runs with --source aider, then only the aider history file is discovered', async () => {
  const sut = main;
  const transcriptDir = makeAiderTranscriptDir();
  // The stray must be a .jsonl the aider markdown parser WOULD emit an event for IF
  // it were (wrongly) discovered — so give it a distinguishable aider token line.
  // A codex-shaped JSON rollup would yield zero aider events regardless of the
  // matcher, making the exclusion property untestable (the vacuous-assertion trap).
  writeFileSync(join(transcriptDir, 'stray.jsonl'), '> Tokens: 4242 sent, 7 received.\n', 'utf8');
  const projectsRoot = dirname(transcriptDir);
  const repoRoot = makeTmp('repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--source', 'aider', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));
  const tokens = report.runs.flatMap(r => r.groups).map(g => g.tokens);
  // Over-discovery (matcher reverting to the default .jsonl filter) would surface the
  // stray's distinguishable 4242 input — the exact-basename aider matcher must exclude it.
  assert.ok(
    tokens.every(t => t.input !== 4242),
    `the stray .jsonl must not be discovered under --source aider; got: ${JSON.stringify(tokens)}`,
  );
  assert.ok(
    tokens.some(t => t.input === 781 && t.output === 19),
    `report must still reflect the aider history file's tokens; got: ${JSON.stringify(tokens)}`,
  );
});
