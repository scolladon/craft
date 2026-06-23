/**
 * In-process unit tests for init-emit main() — covers all Stryker no-coverage mutants.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 * The subprocess bin tests in init-emit.bin.test.js prove end-to-end wiring;
 * these tests give Stryker in-process coverage of every branch.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/init-emit-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function makeTmp() {
  const dir = mkdtempSync(join(tmpdir(), 'init-emit-main-'));
  tmpDirs.push(dir);
  return dir;
}

function makeIo(stdinContent = '') {
  const io = makeCaptureIo();
  io.readStdin = () => stdinContent;
  return io;
}

// ─── missing out-path → EXIT_ERROR + usage diagnostic ────────────────────────

test('Given no out-path argument, when main runs, then returns 1 and stderr contains usage', () => {
  const sut = main;
  const io = makeIo();

  const result = sut([], io);

  assert.equal(result, 1, 'must return 1 when out-path is missing');
  assert.ok(io.stderr.joined().includes('usage'), `stderr must contain usage; got: ${io.stderr.joined()}`);
});

test('Given no out-path argument, when main runs, then the usage diagnostic mentions init-emit', () => {
  const sut = main;
  const io = makeIo();

  const result = sut([], io);

  assert.equal(result, 1);
  assert.ok(io.stderr.joined().includes('init-emit'), `stderr must name init-emit; got: ${io.stderr.joined()}`);
});

// ─── unreadable file → EXIT_ERROR + diagnostic ───────────────────────────────

test('Given an unreadable answers file path, when main runs, then returns 1 and stderr mentions cannot read answers', () => {
  const sut = main;
  const io = makeIo();

  const result = sut(['/no/such/answers.json', '/tmp/out.md'], io);

  assert.equal(result, 1, 'must return 1 on unreadable file');
  assert.ok(io.stderr.joined().includes('cannot read answers'), `stderr was: ${io.stderr.joined()}`);
});

// ─── malformed JSON → EXIT_ERROR + diagnostic ────────────────────────────────

test('Given a file with malformed JSON, when main runs, then returns 1 and stderr mentions malformed answers JSON', () => {
  const sut = main;
  const dir = makeTmp();
  const badPath = join(dir, 'bad.json');
  writeFileSync(badPath, '{{not valid json}}');
  const io = makeIo();

  const result = sut([badPath, join(dir, 'out.md')], io);

  assert.equal(result, 1, 'must return 1 on malformed JSON');
  assert.ok(io.stderr.joined().includes('malformed answers JSON'), `stderr was: ${io.stderr.joined()}`);
});

// ─── non-object answers (null) → EXIT_ERROR + diagnostic ─────────────────────

test('Given a file with JSON null, when main runs, then returns 1 and stderr mentions non-null object', () => {
  const sut = main;
  const dir = makeTmp();
  const nullPath = join(dir, 'null.json');
  writeFileSync(nullPath, 'null');
  const io = makeIo();

  const result = sut([nullPath, join(dir, 'out.md')], io);

  assert.equal(result, 1, 'must return 1 on null answers');
  assert.ok(io.stderr.joined().includes('object'), `stderr must mention object; got: ${io.stderr.joined()}`);
});

// ─── non-object answers (array) → EXIT_ERROR + diagnostic ────────────────────

test('Given a file with a JSON array, when main runs, then returns 1 and stderr mentions non-null object', () => {
  const sut = main;
  const dir = makeTmp();
  const arrPath = join(dir, 'array.json');
  writeFileSync(arrPath, '["a","b"]');
  const io = makeIo();

  const result = sut([arrPath, join(dir, 'out.md')], io);

  assert.equal(result, 1, 'must return 1 on array answers');
  assert.ok(io.stderr.joined().includes('object'), `stderr must mention object; got: ${io.stderr.joined()}`);
});

// ─── non-object answers (number) → EXIT_ERROR + diagnostic ───────────────────
// Kills the typeof-answers !== 'object' ConditionalExpression mutant:
// mutant drops this clause so only null and Array.isArray checks remain,
// letting a number slip through as a non-null non-array value.

test('Given a file with a JSON number, when main runs, then returns 1 and stderr mentions non-null object', () => {
  const sut = main;
  const dir = makeTmp();
  const numPath = join(dir, 'number.json');
  writeFileSync(numPath, '42');
  const io = makeIo();

  const result = sut([numPath, join(dir, 'out.md')], io);

  assert.equal(result, 1, 'must return 1 when answers JSON is a number');
  assert.ok(io.stderr.joined().includes('object'), `stderr must mention object; got: ${io.stderr.joined()}`);
});

// ─── write failure → EXIT_ERROR + diagnostic ─────────────────────────────────

test('Given valid answers but an unwritable out-path, when main runs, then returns 1 and stderr mentions cannot write manifest', () => {
  const sut = main;
  const dir = makeTmp();
  const answersPath = join(dir, 'answers.json');
  writeFileSync(answersPath, JSON.stringify({ name: 'ci' }));
  const io = makeIo();

  const result = sut([answersPath, '/no/such/dir/out.md'], io);

  assert.equal(result, 1, 'must return 1 on write failure');
  assert.ok(io.stderr.joined().includes('cannot write manifest'), `stderr was: ${io.stderr.joined()}`);
});

// ─── success path via file → EXIT_OK + file written ──────────────────────────

test('Given valid answers file and writable out-path, when main runs, then returns 0 and writes the manifest', () => {
  const sut = main;
  const dir = makeTmp();
  const answersPath = join(dir, 'answers.json');
  const outPath = join(dir, 'craft-ci.md');
  writeFileSync(answersPath, JSON.stringify({ name: 'ci', profile: 'lean' }));
  const io = makeIo();

  const result = sut([answersPath, outPath], io);

  assert.equal(result, 0, `stderr was: ${io.stderr.joined()}`);
  const content = readFileSync(outPath, 'utf8');
  assert.ok(content.includes('---'), 'manifest must contain yaml front-matter fence');
  assert.ok(content.includes('lean'), 'manifest must contain the emitted profile');
});

// ─── success path via stdin (empty answers-path) → EXIT_OK ───────────────────

test('Given answers via stdin and an empty answers-path arg, when main runs, then returns 0', () => {
  const sut = main;
  const dir = makeTmp();
  const outPath = join(dir, 'craft-ci.md');
  const io = makeIo(JSON.stringify({ name: 'ci', profile: 'lean' }));

  const result = sut(['', outPath], io);

  assert.equal(result, 0, `stderr was: ${io.stderr.joined()}`);
});

// ─── answers-path absent (undefined argv[0]) → reads stdin ───────────────────

test('Given no answers-path (argv has only out-path), when main runs, then returns 0 reading from stdin', () => {
  const sut = main;
  const dir = makeTmp();
  const outPath = join(dir, 'craft-ci.md');
  // argv[0] = undefined → answersPath = null → falls back to readStdin
  const io = makeIo(JSON.stringify({ name: 'ci' }));

  const result = sut([undefined, outPath], io);

  assert.equal(result, 0, `stderr was: ${io.stderr.joined()}`);
});
