/**
 * In-process unit tests for filter-findings-main.
 *
 * Coverage split: same rationale as normalize-findings-main.test.js — stdin
 * (fd 0 read) is excluded from in-process units because opening fd 0
 * in-process conflicts with the test runner's own stdin; that path is
 * covered end-to-end by the child-process smoke in filter-findings-bin.test.js.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/filter-findings-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

function makeIo() {
  const io = makeCaptureIo();
  io.readStdin = () => { throw new Error('readStdin should not be called in file-path mode'); };
  return io;
}

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function writeTmp(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'filterfind-main-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

const FINDINGS_JSON = JSON.stringify([
  { file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' },
  { file: 'a.js', line: 30, severity: 'LOW', finding: 'out of scope' },
], null, 2) + '\n';

const EXPECTED = JSON.stringify([
  { file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' },
], null, 2) + '\n';

// ─── valid input + scope → exit 0, exact scoped canonical bytes ──────────────

test('Given a JSON findings file and a matching --scope, when main runs, then it returns 0 and stdout is the scoped canonical bytes', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.json', FINDINGS_JSON);

  const result = sut([path, '--scope', 'a.js:1-10'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), EXPECTED);
});

// ─── empty findings input → [] and exit 0 ────────────────────────────────────

test('Given an empty findings array file, when main runs, then it returns 0 and stdout is []', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('empty.json', '[]\n');

  const result = sut([path, '--scope', 'a.js:1-10'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '[]\n');
});

// ─── empty --scope "" → [] and exit 0 (nothing changed → nothing in scope) ──

test('Given a non-empty findings file and an empty --scope, when main runs, then it returns 0 and stdout is [] (nothing is in scope)', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.json', FINDINGS_JSON);

  const result = sut([path, '--scope', ''], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '[]\n');
});

// ─── missing --scope → exit 2 + clean stderr + empty stdout ─────────────────

test('Given no --scope flag, when main runs, then it returns 2 with a clean missing --scope message and no stdout', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.json', FINDINGS_JSON);

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.equal(io.stderr.joined(), 'filter-findings: missing --scope\n');
  assert.equal(io.stdout.joined(), '');
});

// ─── malformed range → exit 2 + clean message naming the entry ──────────────

test('Given a malformed --scope entry, when main runs, then it returns 2 with a clean message naming the entry', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.json', FINDINGS_JSON);

  const result = sut([path, '--scope', 'a.js:9-3'], io);

  assert.equal(result, 2);
  assert.equal(io.stderr.joined(), 'filter-findings: malformed scope entry: "a.js:9-3"\n');
  assert.equal(io.stdout.joined(), '');
});

// ─── nonexistent input path → exit 2, clean, no stack trace ─────────────────

test('Given a nonexistent findings file path, when main runs, then it returns 2 with a clean message and no stack trace', () => {
  const sut = main;
  const io = makeIo();

  const result = sut(['/no/such/findings.json', '--scope', 'a.js:1-10'], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().startsWith('filter-findings: '), `stderr was: ${io.stderr.joined()}`);
  assert.ok(!io.stderr.joined().includes('    at '), 'stderr must not contain a stack trace');
  assert.equal(io.stdout.joined(), '');
});

test('Given --scope as the final argument with no value, when main runs, then it reports the missing value', () => {
  const io = makeIo();

  const result = main(['--scope'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /missing --scope value/u);
});

test('Given a JSON payload that is not an array, when main runs, then it reports the shape rather than an internal error', () => {
  const io = makeIo();
  const path = writeTmp('obj.json', '{"a":1}');

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /findings input must be a JSON array/u);
});

test('Given a non-empty input that filters to nothing, when main runs, then the total drop is announced on stderr', () => {
  const io = makeIo();
  const path = writeTmp('drop.json', JSON.stringify([{ file: 'a.js', line: 2, severity: 'HIGH', finding: 'x' }]));

  const result = main([path, '--scope', 'b.js:1-9'], io);

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /1 of 1 finding\(s\) fell outside the scope/u);
});

test('Given an input that filters to a non-empty result, when main runs, then no drop notice is written', () => {
  const io = makeIo();
  const path = writeTmp('keep.json', JSON.stringify([{ file: 'a.js', line: 2, severity: 'HIGH', finding: 'x' }]));

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  assert.equal(io.stderr.joined(), '');
});

test('Given a mixed payload where some findings fall outside the scope, when main runs, then each drop is named on stderr', () => {
  const io = makeIo();
  const path = writeTmp('mixed.json', JSON.stringify([
    { file: 'a.js', line: 5, severity: 'LOW', finding: 'style' },
    { file: '/abs/a.js', line: 7, severity: 'CRITICAL', finding: 'hardcoded key' },
  ]));

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /dropped \/abs\/a\.js:7 — outside the scope/u);
  assert.match(io.stderr.joined(), /1 of 2 finding\(s\) fell outside the scope/u);
});

test('Given an empty findings array, when main runs, then nothing is reported as dropped', () => {
  const io = makeIo();
  const path = writeTmp('empty.json', '[]');

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  assert.equal(io.stderr.joined(), '');
  assert.equal(io.stdout.joined(), '[]\n');
});

test('Given --repo-root as the final argument with no value, when main runs, then it reports the missing value', () => {
  const io = makeIo();

  const result = main(['--scope', 'a.js:1-9', '--repo-root'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /missing --repo-root value/u);
});

test('Given a repo root written with a trailing slash, when findings are filtered, then it matches the same as without', () => {
  const io = makeIo();
  const path = writeTmp('abs.json', JSON.stringify([
    { file: '/repo/a.js', line: 5, severity: 'HIGH', finding: 'x' },
  ]));

  const result = main([path, '--scope', 'a.js:1-9', '--repo-root', '/repo/'], io);

  assert.equal(result, 0);
  assert.equal(JSON.parse(io.stdout.joined()).length, 1);
});

test('Given an absolute-path finding dropped with no repo root supplied, when main runs, then the notice names that cause', () => {
  const io = makeIo();
  const path = writeTmp('absnoroot.json', JSON.stringify([
    { file: '/repo/a.js', line: 5, severity: 'HIGH', finding: 'x' },
  ]));

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /absolute path, no --repo-root supplied/u);
});
