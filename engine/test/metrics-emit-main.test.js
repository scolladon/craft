/**
 * In-process unit tests for metrics-emit-main() entrypoint.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 * The subprocess bin tests in metrics-emit.bin.test.js prove end-to-end wiring;
 * these tests drive the config-error gate, phase grouping, and ledger append.
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
  cpSync,
  existsSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { main } from '../src/observability/metrics-emit-main.js';
import { LEDGER_HEADER } from '../src/observability/metrics-line.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';
import { containByRealpath } from '../src/contain.js';
import { dashedCwd } from '../src/observability/usage-mine-main.js';

const PROJ_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry', 'projects', 'proj');

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function makeTmp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

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

function ledgerPathFor(repoRoot) {
  return join(repoRoot, '.claude', 'craft-metrics.md');
}

function readLedger(repoRoot) {
  return readFileSync(ledgerPathFor(repoRoot), 'utf8');
}

function runRows(repoRoot) {
  return readLedger(repoRoot).split('\n').filter((line) => line.startsWith('run-x '));
}

function copyProjFixture() {
  const projectsRoot = makeTmp('metrics-emit-projects-');
  const transcriptDir = join(projectsRoot, 'proj');
  cpSync(PROJ_FIXTURE, transcriptDir, { recursive: true });
  return { projectsRoot, transcriptDir };
}

// A sub-agent assistant usage line, mirroring the committed fixture's shape —
// both cache fields present so the split renders, never `cache=na`.
function reviewerLine(timestamp, input, output) {
  return JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-a',
    timestamp,
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: input, cache_read_input_tokens: 1, cache_creation_input_tokens: 1, output_tokens: output },
    },
  });
}

function addReviewerSpawn(subagentsDir, id, timestamp) {
  writeFileSync(join(subagentsDir, `agent-review-${id}.jsonl`), `${reviewerLine(timestamp, 1, 1)}\n`, 'utf8');
  writeFileSync(join(subagentsDir, `agent-review-${id}.meta.json`), JSON.stringify({ agentType: 'craft:reviewer' }), 'utf8');
}

const TELEMETRY_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry');
const SKIP_NOTE = 'metrics-emit: no --session, compaction estimate skipped\n';
const LINE_ALL = 'Compactions: 3 (main 2, sub-agent 1) — estimated summary-call cost 32k–60k equiv (estimate; not in totals)\n';
const LINE_SUBAGENT_ONLY = 'Compactions: 1 (main 0, sub-agent 1) — estimated summary-call cost 9k–16k equiv (estimate; not in totals)\n';
const LINE_MAIN_ONLY = 'Compactions: 2 (main 2, sub-agent 0) — estimated summary-call cost 23k–45k equiv (estimate; not in totals)\n';
const LINE_SINCE = 'Compactions: 2 (main 1, sub-agent 1) — estimated summary-call cost 22k–41k equiv (estimate; not in totals)\n';

// Scoping is by path, so the fixture lines' own sessionId is irrelevant.
function addCompactedSession(transcriptDir, sessionId) {
  const subagentsDir = join(transcriptDir, sessionId, 'subagents');
  mkdirSync(subagentsDir, { recursive: true });
  cpSync(join(TELEMETRY_FIXTURE_DIR, 'compaction-main.jsonl'), join(transcriptDir, `${sessionId}.jsonl`));
  cpSync(join(TELEMETRY_FIXTURE_DIR, 'compaction-subagent.jsonl'), join(subagentsDir, 'agent-c.jsonl'));
  writeFileSync(join(subagentsDir, 'agent-c.meta.json'), JSON.stringify({ agentType: 'craft:planner' }), 'utf8');
}

function compactionLines(io) {
  return io.stdout.writes.filter((write) => write.startsWith('Compactions:'));
}

function openSpy(opened) {
  return (path) => {
    opened.push(String(path));
    return createReadStream(path);
  };
}

function compactedTree() {
  const { projectsRoot, transcriptDir } = copyProjFixture();
  addCompactedSession(transcriptDir, 'sess-c');
  return { projectsRoot, transcriptDir, repoRoot: makeTmp('metrics-emit-repo-') };
}

// ── 1. absent transcript dir + explicit --phase degrades to transcript=na ──

test('Given a transcript dir that does not exist and an explicit --phase, when main runs, then it appends one transcript=na row and returns 0', async () => {
  const sut = main;
  const repoRoot = makeTmp('metrics-emit-repo-');
  const projectsRoot = join(makeTmp('metrics-emit-parent-'), 'does-not-exist');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--phase', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(readLedger(repoRoot).includes('run-x design transcript=na'), `expected the na row; got:\n${readLedger(repoRoot)}`);
});

// ── 2. fan-out phase aggregates every spawn into one row ───────────────────

test('Given a fan-out phase with three sub-agent transcripts, when main runs, then one row is appended for that phase, aggregating all three spawns', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const subagentsDir = join(transcriptDir, 'sess-a', 'subagents');
  addReviewerSpawn(subagentsDir, 1, '2026-01-01T00:07:00.000Z');
  addReviewerSpawn(subagentsDir, 2, '2026-01-01T00:08:00.000Z');
  addReviewerSpawn(subagentsDir, 3, '2026-01-01T00:09:00.000Z');
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--phase', 'review', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const rows = runRows(repoRoot);
  assert.equal(rows.length, 1, `expected exactly one row; got:\n${readLedger(repoRoot)}`);
  assert.match(rows[0], /\bturns=3\b/, `expected turns=3 aggregating all three spawns; got: ${rows[0]}`);
  assert.match(rows[0], /cache_read=\d+ cache_creation=\d+/, `expected the cache split rendered, not na; got: ${rows[0]}`);
});

// ── 3. the four config-error exits, one flag each ──────────────────────────

test('Given a missing --run, when main runs, then it returns 1 and names the flag on stderr', async () => {
  const sut = main;
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ repoRoot });

  const result = await sut([], io);

  assert.equal(result, 1);
  assert.ok(io.stderr.joined().includes('--run'), `stderr: ${io.stderr.joined()}`);
});

test('Given an unparseable --since, when main runs, then it returns 1 and names the flag on stderr', async () => {
  const sut = main;
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ repoRoot });

  const result = await sut(['--run', 'run-x', '--since', 'not-a-date'], io);

  assert.equal(result, 1);
  assert.ok(io.stderr.joined().includes('--since'), `stderr: ${io.stderr.joined()}`);
});

test('Given a --dir outside the projects root, when main runs, then it returns 1 and names the flag on stderr', async () => {
  const sut = main;
  const projectsRoot = makeTmp('metrics-emit-projects-');
  const outside = makeTmp('metrics-emit-outside-');
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--dir', outside], io);

  assert.equal(result, 1);
  assert.ok(io.stderr.joined().includes('--dir'), `stderr: ${io.stderr.joined()}`);
});

test('Given a --ledger outside the repo root, when main runs, then it returns 1 and names the flag on stderr', async () => {
  const sut = main;
  const repoRoot = makeTmp('metrics-emit-repo-');
  const outsideLedger = join(makeTmp('metrics-emit-outside-'), 'ledger.md');
  const io = makeIo({ repoRoot });

  const result = await sut(['--run', 'run-x', '--ledger', outsideLedger], io);

  assert.equal(result, 1);
  assert.ok(io.stderr.joined().includes('--ledger'), `stderr: ${io.stderr.joined()}`);
});

// ── 4. an unreadable/absent sidecar degrades to no label, no row ───────────

test('Given a transcript whose sidecar is unreadable, when main runs, then the run degrades to the unlabelled path, exits 0, and emits no row for it', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const rows = runRows(repoRoot);
  assert.deepEqual(rows.map((r) => r.split(' ')[1]), ['design'], `expected only the labelled design row; got:\n${readLedger(repoRoot)}`);
  assert.match(rows[0], /\bturns=1\b/, `only agent-good carries a valid label; got: ${rows[0]}`);
});

// ── omitting --phase: every distinct phase found, in SORTED order ─────────

test('Given no --phase flag and two distinct labelled phases discovered out of alphabetical order, when main runs, then the rows come out sorted by phase name (not discovery order)', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const subagentsDir = join(transcriptDir, 'sess-a', 'subagents');
  // 'agent-a' sorts (and so is discovered/inserted) BEFORE 'agent-good' — a
  // review-then-design insertion order that only a real sort reverses.
  writeFileSync(join(subagentsDir, 'agent-a.jsonl'), `${reviewerLine('2026-01-01T00:07:00.000Z', 1, 1)}\n`, 'utf8');
  writeFileSync(join(subagentsDir, 'agent-a.meta.json'), JSON.stringify({ agentType: 'craft:reviewer' }), 'utf8');
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const rows = runRows(repoRoot);
  assert.deepEqual(rows.map((r) => r.split(' ')[1]), ['design', 'review'], `expected alphabetical order regardless of discovery order; got:\n${readLedger(repoRoot)}`);
});

// ── 5. the ledger header is written once, then only appended to ───────────

test('Given an absent ledger file, when main runs, then the header is written once and a second run appends without repeating it', async () => {
  const sut = main;
  const repoRoot = makeTmp('metrics-emit-repo-');
  const projectsRoot = join(makeTmp('metrics-emit-parent-'), 'does-not-exist');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--run', 'run-1', '--phase', 'design'], io);
  await sut(['--run', 'run-2', '--phase', 'design'], io);

  const ledger = readLedger(repoRoot);
  const headerOccurrences = ledger.split(LEDGER_HEADER).length - 1;
  assert.equal(headerOccurrences, 1, `expected the header exactly once; got:\n${ledger}`);
  assert.ok(ledger.includes('run-1 design transcript=na'));
  const lines = ledger.split('\n');
  assert.ok(lines.includes('run-2 design transcript=na'), `the append to an EXISTING ledger must insert nothing before the new row; got:\n${ledger}`);
});

// ── 11. --run and --phase are shape-checked before any row is built ────────

test('Given a --run carrying a newline, when main runs, then it is a config error and no ledger is written', async () => {
  const sut = main;
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot: makeTmp('metrics-emit-parent-'), repoRoot });

  const result = await sut(['--run', 'ok\nFAKE-RUN design turns=9999 equiv=1'], io);

  assert.equal(result, 1);
  assert.match(io.stderr.joined(), /invalid --run/);
  assert.throws(() => readLedger(repoRoot), 'expected no ledger file to be created at all');
});

test('Given a --phase carrying a newline, when main runs, then it is a config error and no ledger is written', async () => {
  const sut = main;
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot: makeTmp('metrics-emit-parent-'), repoRoot });

  const result = await sut(['--run', 'run-x', '--phase', 'zzz transcript=na\nFAKE2 review turns=1'], io);

  assert.equal(result, 1);
  assert.match(io.stderr.joined(), /invalid --phase/);
  assert.throws(() => readLedger(repoRoot), 'expected no ledger file to be created at all');
});

// ── 12. a non-ENOENT ledger read failure must never rewrite the ledger ────

test('Given a ledger whose read fails for a reason other than absence, when main runs, then it refuses the write and the on-disk history is unchanged', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const history = `${LEDGER_HEADER}historic-run design turns=1 tokens=1\nhistoric-run review turns=2 tokens=2\n`;
  mkdirSync(join(repoRoot, '.claude'), { recursive: true });
  writeFileSync(ledgerPathFor(repoRoot), history, 'utf8');
  // The spy COUNTS rather than asserting: production wraps writeFileSync in a
  // try/catch, so an assert.fail thrown here would be swallowed and rendered as
  // an advisory line — the assertion has to happen outside the SUT.
  let writeCalls = 0;
  const io = makeIo({
    projectsRoot,
    repoRoot,
    readFileSync: (path, enc) => {
      if (String(path).endsWith('craft-metrics.md')) {
        const err = new Error('EACCES'); err.code = 'EACCES'; throw err;
      }
      return readFileSync(path, enc);
    },
    writeFileSync: (...args) => { writeCalls += 1; return writeFileSync(...args); },
  });

  const result = await sut(['--run', 'run-x', '--phase', 'design', '--dir', transcriptDir], io);

  assert.equal(result, 0, 'a refused append stays advisory');
  assert.equal(writeCalls, 0, 'the prior content is unknown, so nothing may be written');
  assert.equal(readLedger(repoRoot), history, 'every historical row must survive byte-for-byte');
  assert.ok(
    io.stderr.joined().includes('ledger read failed (EACCES)'),
    `expected the real error code, not a placeholder, in: ${io.stderr.joined()}`,
  );
  assert.equal(
    io.stderr.writes.filter((w) => w.includes('refusing to write')).length,
    1,
    'the refusal is announced exactly once',
  );
});

test('Given a ledger read failure whose error carries no .code, when main runs, then the refusal names it "unknown", not a blank', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  mkdirSync(join(repoRoot, '.claude'), { recursive: true });
  writeFileSync(ledgerPathFor(repoRoot), `${LEDGER_HEADER}historic-run design turns=1 tokens=1\n`, 'utf8');
  const io = makeIo({
    projectsRoot,
    repoRoot,
    readFileSync: (path, enc) => {
      if (String(path).endsWith('craft-metrics.md')) throw new Error('boom'); // no .code
      return readFileSync(path, enc);
    },
  });

  const result = await sut(['--run', 'run-x', '--phase', 'design', '--dir', transcriptDir], io);

  assert.equal(result, 0);
  assert.ok(io.stderr.joined().includes('ledger read failed (unknown)'), `stderr: ${io.stderr.joined()}`);
});

test('Given a ledger that is genuinely absent, when main runs, then the header is written once and the row appended', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--phase', 'design', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(readLedger(repoRoot).startsWith(LEDGER_HEADER), 'ENOENT is still the create-new-ledger path');
  assert.ok(io.stdout.joined().includes('run-x design'), `every appended row must also echo to stdout; got: ${io.stdout.joined()}`);
});

// ── no --dir: the claude-source default resolves root/<dashed-cwd> ─────────

test('Given no --dir flag, when main runs, then the default transcript dir is the projects root scoped to the dashed cwd (the claude-source resolver, not the bare root)', async () => {
  const sut = main;
  const projectsRoot = makeTmp('metrics-emit-projects-');
  const cwd = '/repo/checkout';
  const transcriptDir = join(projectsRoot, dashedCwd(cwd));
  cpSync(PROJ_FIXTURE, transcriptDir, { recursive: true });
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot, cwd });

  const result = await sut(['--run', 'run-x', '--phase', 'design'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  const ledger = readLedger(repoRoot);
  assert.ok(!ledger.includes('transcript=na'), `a "na" row means the wrong dir was scanned (the bare root, not root/dashed-cwd); got:\n${ledger}`);
  assert.match(ledger, /run-x design turns=1\b/, `expected the labelled design row with real data; got:\n${ledger}`);
});

// ── 13. --since bounds a re-run so the second row never re-counts the first ─

test('Given two spawns of one phase, when --since falls between them, then only the later spawn is counted', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const subagentsDir = join(transcriptDir, 'sess-a', 'subagents');
  addReviewerSpawn(subagentsDir, 'early', '2026-01-01T00:01:00.000Z');
  addReviewerSpawn(subagentsDir, 'late', '2026-01-01T00:09:00.000Z');
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(
    ['--run', 'run-x', '--phase', 'review', '--dir', transcriptDir, '--since', '2026-01-01T00:05:00.000Z'],
    io,
  );

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.match(runRows(repoRoot)[0], /\bturns=1\b/, 'the pre-since spawn must not be re-counted');
});

test('Given two spawns of one phase, when --since is omitted, then both are counted', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const subagentsDir = join(transcriptDir, 'sess-a', 'subagents');
  addReviewerSpawn(subagentsDir, 'early', '2026-01-01T00:01:00.000Z');
  addReviewerSpawn(subagentsDir, 'late', '2026-01-01T00:09:00.000Z');
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--phase', 'review', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.match(runRows(repoRoot)[0], /\bturns=2\b/, 'no lower bound means the whole phase');
});

// ── 14. --session narrows to one session directory ────────────────────────

test('Given two session directories holding the same phase, when --session names one, then only that session contributes', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  addReviewerSpawn(join(transcriptDir, 'sess-a', 'subagents'), 'a1', '2026-01-01T00:07:00.000Z');
  const otherSubagents = join(transcriptDir, 'sess-c', 'subagents');
  mkdirSync(otherSubagents, { recursive: true });
  addReviewerSpawn(otherSubagents, 'c1', '2026-01-01T00:08:00.000Z');
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--phase', 'review', '--dir', transcriptDir, '--session', 'sess-a'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.match(runRows(repoRoot)[0], /\bturns=1\b/, 'only the named session may contribute');
});

// ── 15. an unreadable transcript is counted and surfaced, never swallowed ──

test('Given a transcript that cannot be opened, when main runs, then the count is surfaced on stderr and the run still returns 0', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  addReviewerSpawn(join(transcriptDir, 'sess-a', 'subagents'), 'boom', '2026-01-01T00:07:00.000Z');
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({
    projectsRoot,
    repoRoot,
    createReadStream: (path) => {
      if (String(path).includes('agent-review-boom')) throw new Error('EIO');
      return createReadStream(path);
    },
  });

  const result = await sut(['--run', 'run-x', '--phase', 'review', '--dir', transcriptDir], io);

  assert.equal(result, 0, 'an unreadable spawn stays advisory');
  assert.equal(
    io.stderr.writes.filter((w) => w.includes('transcript(s) unreadable')).length,
    1,
    'the advisory is announced exactly once, not once per bad transcript',
  );
  assert.match(io.stderr.joined(), /1 transcript\(s\) unreadable, 0 refused by containment/);
});

test('Given a clean run with no unreadable or refused transcripts, when main runs, then the advisory line never fires', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--phase', 'design', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stderr.joined().includes('transcript(s) unreadable'), `a clean run must never print the advisory; got: ${io.stderr.joined()}`);
});

// ── 16. a ledger write failure is advisory, and it says so ────────────────

test('Given a ledger write that throws, when main runs, then one stderr line names it and the exit stays 0', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({
    projectsRoot,
    repoRoot,
    writeFileSync: () => { const err = new Error('EROFS'); err.code = 'EROFS'; throw err; },
  });

  const result = await sut(['--run', 'run-x', '--phase', 'design', '--dir', transcriptDir], io);

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /ledger write failed \(EROFS\)/);
});

test('Given a ledger write failure whose error carries no .code, when main runs, then the message names it "unknown", not a blank', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({
    projectsRoot,
    repoRoot,
    writeFileSync: () => { throw new Error('boom'); }, // no .code
  });

  const result = await sut(['--run', 'run-x', '--phase', 'design', '--dir', transcriptDir], io);

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /ledger write failed \(unknown\)/);
});

// ── 17. a transcript refused by containment is counted, not silently dropped ─

test('Given a transcript the containment check refuses, when main runs, then the refusal is counted on stderr', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  addReviewerSpawn(join(transcriptDir, 'sess-a', 'subagents'), 'refused', '2026-01-01T00:07:00.000Z');
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({
    projectsRoot,
    repoRoot,
    containByRealpath: (root, candidate) => (
      String(candidate).includes('agent-review-refused') ? null : containByRealpath(root, candidate)
    ),
  });

  const result = await sut(['--run', 'run-x', '--phase', 'review', '--dir', transcriptDir], io);

  assert.equal(result, 0, 'a refused transcript stays advisory');
  assert.match(
    io.stderr.joined(),
    /0 transcript\(s\) unreadable, 1 refused by containment/,
    'the refused disjunct must be observable, not just the failed one',
  );
});

// ── 18. no --phase and zero phased events found: an advisory no-op ────────

test('Given no --phase flag and a transcript dir with no labelled events at all, when main runs, then it writes no ledger and prints a named advisory, exiting 0', async () => {
  const sut = main;
  const projectsRoot = makeTmp('metrics-emit-projects-');
  const transcriptDir = join(projectsRoot, 'empty-proj');
  mkdirSync(transcriptDir, { recursive: true });
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stderr.joined(), `metrics-emit: no events found for run 'run-x'\n${SKIP_NOTE}`);
});

// ── 19. the run-level call prints the session's compaction estimate line ──

test('Given a session whose main and sub-agent transcripts both compacted, when the run-level call names it with --session, then the last stdout line is the session\'s Compactions estimate and stderr stays empty', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir, repoRoot } = compactedTree();
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--dir', transcriptDir, '--session', 'sess-c'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.writes.at(-1), LINE_ALL);
  assert.equal(io.stderr.joined(), '');
});

test('Given two trees that differ only by the session\'s main transcript, when the run-level call runs on each, then both ledgers are byte-identical and only the trailing Compactions line differs', async () => {
  const sut = main;
  const a = compactedTree();
  const b = compactedTree();
  rmSync(join(b.transcriptDir, 'sess-c.jsonl'));
  const ioA = makeIo({ projectsRoot: a.projectsRoot, repoRoot: a.repoRoot });
  const ioB = makeIo({ projectsRoot: b.projectsRoot, repoRoot: b.repoRoot });

  await sut(['--run', 'run-x', '--dir', a.transcriptDir, '--session', 'sess-c'], ioA);
  await sut(['--run', 'run-x', '--dir', b.transcriptDir, '--session', 'sess-c'], ioB);

  assert.equal(readLedger(a.repoRoot), readLedger(b.repoRoot));
  assert.deepEqual(ioA.stdout.writes.slice(0, -1), ioB.stdout.writes.slice(0, -1));
  assert.equal(ioB.stdout.writes.at(-1), LINE_SUBAGENT_ONLY);
});

test('Given --phase and --session, when main runs, then no Compactions line prints, no skip note prints and the session\'s main transcript is never opened', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir, repoRoot } = compactedTree();
  const opened = [];
  const io = makeIo({ projectsRoot, repoRoot, createReadStream: openSpy(opened) });

  await sut(['--run', 'run-x', '--phase', 'planning', '--dir', transcriptDir, '--session', 'sess-c'], io);

  assert.deepEqual(compactionLines(io), []);
  assert.equal(opened.some((path) => path.endsWith('sess-c.jsonl')), false);
  assert.equal(io.stderr.joined().includes('compaction estimate skipped'), false);
  assert.match(runRows(repoRoot)[0], /^run-x planning /);
});

test('Given a named session with no compaction, when the run-level call runs, then stdout carries the appended rows only and stderr stays empty', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--run', 'run-x', '--dir', transcriptDir, '--session', 'sess-a'], io);

  assert.deepEqual(io.stdout.writes, runRows(repoRoot).map((row) => `${row}\n`));
  assert.equal(io.stderr.joined(), '');
});

test('Given sess-c and sess-cc both compacted, when the run-level call names sess-c, then only sess-c\'s compactions are counted', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir, repoRoot } = compactedTree();
  addCompactedSession(transcriptDir, 'sess-cc');
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--run', 'run-x', '--dir', transcriptDir, '--session', 'sess-c'], io);

  assert.deepEqual(compactionLines(io), [LINE_ALL]);
});

test('Given only the session\'s main transcript and no sub-agent of that session, when the run-level call runs, then it reports no events, writes no ledger, and still prints the main-only Compactions line', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  cpSync(join(TELEMETRY_FIXTURE_DIR, 'compaction-main.jsonl'), join(transcriptDir, 'sess-c.jsonl'));
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--dir', transcriptDir, '--session', 'sess-c'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stderr.joined(), "metrics-emit: no events found for run 'run-x'\n");
  assert.deepEqual(io.stdout.writes, [LINE_MAIN_ONLY]);
  assert.equal(existsSync(ledgerPathFor(repoRoot)), false);
});

test('Given --since between the two main-loop compactions, when the run-level call runs, then the line counts only boundaries at or after it', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir, repoRoot } = compactedTree();
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--run', 'run-x', '--dir', transcriptDir, '--session', 'sess-c', '--since', '2026-03-01T10:30:00.000Z'], io);

  assert.deepEqual(compactionLines(io), [LINE_SINCE]);
});

test('Given a --session naming a sub-agent transcript path, when the run-level call runs, then no Compactions line prints', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir, repoRoot } = compactedTree();
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--dir', transcriptDir, '--session', 'sess-c/subagents/agent-c'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.deepEqual(compactionLines(io), []);
});

test('Given an empty --session, when the run-level call runs, then no Compactions line prints and stderr carries the skip note', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir, repoRoot } = compactedTree();
  const io = makeIo({ projectsRoot, repoRoot });

  await sut(['--run', 'run-x', '--dir', transcriptDir, '--session', ''], io);

  assert.deepEqual(compactionLines(io), []);
  assert.equal(io.stderr.writes.includes(SKIP_NOTE), true);
});

// ── 20. the skip note and the summed advisory counts ──

test('Given no --session, when the run-level call runs, then no Compactions line prints, no main transcript is opened, and stderr carries the skip note', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir, repoRoot } = compactedTree();
  cpSync(join(TELEMETRY_FIXTURE_DIR, 'compaction-main.jsonl'), join(transcriptDir, 'null.jsonl'));
  const opened = [];
  const io = makeIo({ projectsRoot, repoRoot, createReadStream: openSpy(opened) });

  await sut(['--run', 'run-x', '--dir', transcriptDir], io);

  assert.deepEqual(compactionLines(io), []);
  assert.equal(io.stderr.writes.includes(SKIP_NOTE), true);
  assert.equal(opened.length > 0 && opened.every((path) => path.includes('/subagents/')), true);
});

test('Given --phase and no --session, when main runs, then no skip note is written', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--phase', 'design', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stderr.joined(), '');
});

test('Given the session\'s main transcript refused by containment, when the run-level call runs, then the advisory counts one refusal and the line carries the sub-agent compaction only', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir, repoRoot } = compactedTree();
  const io = makeIo({
    projectsRoot,
    repoRoot,
    containByRealpath: (root, candidate) => (String(candidate).endsWith('sess-c.jsonl') ? null : containByRealpath(root, candidate)),
  });

  await sut(['--run', 'run-x', '--dir', transcriptDir, '--session', 'sess-c'], io);

  assert.equal(io.stderr.joined(), 'metrics-emit: 0 transcript(s) unreadable, 1 refused by containment\n');
  assert.deepEqual(compactionLines(io), [LINE_SUBAGENT_ONLY]);
});

test('Given both the main and the sub-agent transcript of the session unreadable, when the run-level call runs, then one advisory line sums both failures', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir, repoRoot } = compactedTree();
  const io = makeIo({
    projectsRoot,
    repoRoot,
    createReadStream: (path) => {
      if (/(sess-c|agent-c)\.jsonl$/.test(String(path))) throw new Error('EIO');
      return createReadStream(path);
    },
  });

  await sut(['--run', 'run-x', '--dir', transcriptDir, '--session', 'sess-c'], io);

  assert.equal(
    io.stderr.joined(),
    "metrics-emit: 2 transcript(s) unreadable, 0 refused by containment\nmetrics-emit: no events found for run 'run-x'\n",
  );
  assert.deepEqual(io.stdout.writes, []);
});
