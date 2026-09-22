/**
 * In-process unit tests for run-state-main. Stdin (fd 0 read) is excluded
 * from in-process units the same way filter-findings-main.test.js excludes
 * it; the real bin's stdin wiring is covered by run-state.bin.test.js.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { main } from '../src/run-state-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, 'fixtures', 'run-ledger');

const DEFAULT_IDS = [
  'workspace', 'design', 'decisions', 'planning', 'implementation',
  'review', 'refactoring', 'validation', 'documentation', 'propose', 'integrate',
];

function makeResolutionJson(ids, awaiting) {
  return JSON.stringify({
    effective: ids.map((id) => ({ id })),
    gateDecisions: [{ phaseId: 'propose', awaitingHarnesses: awaiting }],
  });
}

const DEFAULT_RESOLUTION_JSON = makeResolutionJson(DEFAULT_IDS, ['validation']);

function makeIo(stdin) {
  const io = makeCaptureIo();
  io.readStdin = () => stdin;
  return io;
}

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function writeTmp(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'run-state-main-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

const EXPECTED_MID_REVIEW_STATE = {
  run: 'demo',
  completed: ['workspace', 'design', 'decisions', 'planning', 'implementation'],
  inFlight: [{ phase: 'review', since: '2026-09-22T10:40:00Z' }],
  next: 'refactoring',
  awaitingHarnesses: ['validation'],
  parts: [{ n: 1, sha: 'abc1234', size: 'pure-module', outcome: 'pass' }],
  findings: [{ dimension: 'code', cycle: 1, path: '/tmp/craft-review.fixture/code.c1.json', count: 3 }],
  background: [],
  warnings: [],
};
const EXPECTED_MID_REVIEW_STDOUT = `${JSON.stringify(EXPECTED_MID_REVIEW_STATE, null, 2)}\n`;

// ─── happy path: exit 0, exact stdout ────────────────────────────────────────

test('Given mid-review.md and a default resolution on stdin, when main runs with [ledger, --run, demo], then it returns 0 and stdout is the expected state JSON', () => {
  const sut = main;
  const io = makeIo(DEFAULT_RESOLUTION_JSON);
  const ledgerPath = join(FIXTURES_DIR, 'mid-review.md');

  const result = sut([ledgerPath, '--run', 'demo'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), EXPECTED_MID_REVIEW_STDOUT);
});

test('Given --run demo placed before the ledger path, when main runs, then it returns 0 and stdout is the same expected state JSON', () => {
  const sut = main;
  const io = makeIo(DEFAULT_RESOLUTION_JSON);
  const ledgerPath = join(FIXTURES_DIR, 'mid-review.md');

  const result = sut(['--run', 'demo', ledgerPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), EXPECTED_MID_REVIEW_STDOUT);
});

// ─── mismatch: exit 1, empty stdout, both sets named on stderr ──────────────

test('Given a ledger awaiting validation and a resolution awaiting validation and architecture, when main runs, then it returns 1, stdout is empty, and stderr names both sets', () => {
  const sut = main;
  const io = makeIo(makeResolutionJson(DEFAULT_IDS, ['validation', 'architecture']));
  const ledgerPath = join(FIXTURES_DIR, 'mid-review.md');

  const result = sut([ledgerPath, '--run', 'demo'], io);

  assert.equal(result, 1);
  assert.equal(io.stdout.joined(), '');
  assert.equal(
    io.stderr.joined(),
    'run-state: AWAITING(propose) mismatch — ledger: validation; resolution: validation,architecture\n',
  );
});

test('Given a ledger with no AWAITING line and a non-empty resolved set, when main runs, then the ledger side of the mismatch renders as absent', () => {
  const sut = main;
  const io = makeIo(makeResolutionJson(DEFAULT_IDS, ['validation']));
  const ledgerPath = writeTmp('no-awaiting.md', '# craft run record (append-only)\ndemo workspace PHASE-START(workspace): 2026-09-22T10:00:00Z\n');

  const result = sut([ledgerPath, '--run', 'demo'], io);

  assert.equal(result, 1);
  assert.equal(io.stdout.joined(), '');
  assert.equal(
    io.stderr.joined(),
    'run-state: AWAITING(propose) mismatch — ledger: absent; resolution: validation\n',
  );
});

// ─── exit 2: one stderr line, empty stdout, per invalid-input case ──────────

test('Given a missing ledger file, when main runs, then it returns 2 with one stderr line and empty stdout', () => {
  const sut = main;
  const io = makeIo(DEFAULT_RESOLUTION_JSON);

  const result = sut(['/no/such/ledger.md', '--run', 'demo'], io);

  assert.equal(result, 2);
  assert.equal(io.stdout.joined(), '');
  assert.equal(io.stderr.joined().split('\n').filter(Boolean).length, 1);
  assert.match(io.stderr.joined(), /^run-state: /);
});

test('Given stdin that is not JSON, when main runs, then it returns 2 with one stderr line and empty stdout', () => {
  const sut = main;
  const io = makeIo('not json');
  const ledgerPath = join(FIXTURES_DIR, 'mid-review.md');

  const result = sut([ledgerPath, '--run', 'demo'], io);

  assert.equal(result, 2);
  assert.equal(io.stdout.joined(), '');
  assert.equal(io.stderr.joined().split('\n').filter(Boolean).length, 1);
  assert.match(io.stderr.joined(), /^run-state: /);
});

test('Given stdin {} with no effective array, when main runs, then it returns 2 with one stderr line and empty stdout', () => {
  const sut = main;
  const io = makeIo('{}');
  const ledgerPath = join(FIXTURES_DIR, 'mid-review.md');

  const result = sut([ledgerPath, '--run', 'demo'], io);

  assert.equal(result, 2);
  assert.equal(io.stdout.joined(), '');
  assert.equal(io.stderr.joined().split('\n').filter(Boolean).length, 1);
  assert.match(io.stderr.joined(), /^run-state: /);
});

test('Given no --run flag, when main runs, then it returns 2 with one stderr line and empty stdout', () => {
  const sut = main;
  const io = makeIo(DEFAULT_RESOLUTION_JSON);
  const ledgerPath = join(FIXTURES_DIR, 'mid-review.md');

  const result = sut([ledgerPath], io);

  assert.equal(result, 2);
  assert.equal(io.stdout.joined(), '');
  assert.match(io.stderr.joined(), /missing --run/);
});

test('Given --run with no value, when main runs, then it returns 2 with one stderr line and empty stdout', () => {
  const sut = main;
  const io = makeIo(DEFAULT_RESOLUTION_JSON);
  const ledgerPath = join(FIXTURES_DIR, 'mid-review.md');

  const result = sut([ledgerPath, '--run'], io);

  assert.equal(result, 2);
  assert.equal(io.stdout.joined(), '');
  assert.match(io.stderr.joined(), /missing --run value/);
});

test('Given no ledger path, when main runs, then it returns 2 with one stderr line and empty stdout', () => {
  const sut = main;
  const io = makeIo(DEFAULT_RESOLUTION_JSON);

  const result = sut(['--run', 'demo'], io);

  assert.equal(result, 2);
  assert.equal(io.stdout.joined(), '');
  assert.match(io.stderr.joined(), /missing ledger path/);
});

test('Given an unknown flag, when main runs, then it returns 2 naming the flag', () => {
  const sut = main;
  const io = makeIo(DEFAULT_RESOLUTION_JSON);
  const ledgerPath = join(FIXTURES_DIR, 'mid-review.md');

  const result = sut([ledgerPath, '--run', 'demo', '--x'], io);

  assert.equal(result, 2);
  assert.equal(io.stdout.joined(), '');
  assert.match(io.stderr.joined(), /unknown option --x/);
});

test('Given a surplus positional argument, when main runs, then it returns 2 with one stderr line and empty stdout', () => {
  const sut = main;
  const io = makeIo(DEFAULT_RESOLUTION_JSON);
  const ledgerPath = join(FIXTURES_DIR, 'mid-review.md');

  const result = sut([ledgerPath, 'extra', '--run', 'demo'], io);

  assert.equal(result, 2);
  assert.equal(io.stdout.joined(), '');
  assert.equal(io.stderr.joined().split('\n').filter(Boolean).length, 1);
  assert.match(io.stderr.joined(), /^run-state: /);
});
