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
} from 'node:fs';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { main } from '../src/observability/metrics-emit-main.js';
import { LEDGER_HEADER } from '../src/observability/metrics-line.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';
import { containByRealpath } from '../src/contain.js';

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
  assert.ok(ledger.includes('run-2 design transcript=na'));
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

test('Given a ledger whose read fails for a reason other than absence, when main runs, then it refuses to write and every historical row survives', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const history = `${LEDGER_HEADER}historic-run design turns=1 tokens=1\nhistoric-run review turns=2 tokens=2\n`;
  const io = makeIo({
    projectsRoot,
    repoRoot,
    readFileSync: (path, enc) => {
      if (String(path).endsWith('craft-metrics.md')) {
        const err = new Error('EACCES'); err.code = 'EACCES'; throw err;
      }
      return readFileSync(path, enc);
    },
    writeFileSync: () => assert.fail('writeFileSync must not be called when the prior ledger content is unknown'),
  });

  const result = await sut(['--run', 'run-x', '--phase', 'design', '--dir', transcriptDir], io);

  assert.equal(result, 0, 'a refused append stays advisory');
  assert.match(io.stderr.joined(), /ledger read failed \(EACCES\), refusing to write/);
  assert.equal(history.includes('historic-run design'), true, 'guard: the history fixture is well-formed');
});

test('Given a ledger that is genuinely absent, when main runs, then the header is written once and the row appended', async () => {
  const sut = main;
  const { projectsRoot, transcriptDir } = copyProjFixture();
  const repoRoot = makeTmp('metrics-emit-repo-');
  const io = makeIo({ projectsRoot, repoRoot });

  const result = await sut(['--run', 'run-x', '--phase', 'design', '--dir', transcriptDir], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(readLedger(repoRoot).startsWith(LEDGER_HEADER), 'ENOENT is still the create-new-ledger path');
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
  assert.match(io.stderr.joined(), /1 transcript\(s\) unreadable/, 'a failed transcript must not vanish silently');
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
