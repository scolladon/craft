/**
 * In-process unit tests for normalize-findings-main.
 *
 * Coverage split: these units drive the file-path branch, error branches, and
 * the argv[0] || null empty-string routing. The stdin branch (fd 0 read) is
 * excluded from in-process units because opening fd 0 in-process conflicts with
 * the test runner's own stdin; that path is covered end-to-end by the retained
 * child-process smoke in normalize-findings-bin.test.js.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/normalize-findings-main.js';

function makeIo() {
  const io = {
    stdout: { writes: [], write(s) { this.writes.push(s); } },
    stderr: { writes: [], write(s) { this.writes.push(s); } },
    readStdin: () => { throw new Error('readStdin should not be called in file-path mode'); },
  };
  io.stdout.joined = () => io.stdout.writes.join('');
  io.stderr.joined = () => io.stderr.writes.join('');
  return io;
}

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function writeTmp(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'normfind-main-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

// Reuse the same shape constants as the bin test for consistency.
const JSON_INPUT = JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', fix: 'y' }]);
const LINE_INPUT = 'HIGH a.js:3 — x | y';
const EXPECTED = JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', fix: 'y' }], null, 2) + '\n';

// ─── file-path mode with JSON input → returns 0 + exact canonical bytes ───────

test('Given a JSON-array file path arg, when main runs, then returns 0 and stdout equals the canonical bytes', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.json', JSON_INPUT);

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), EXPECTED);
  assert.equal(io.stderr.joined(), '');
});

// ─── file-path mode with per-line input → byte-identical to JSON-mode output ──

test('Given a per-line file path arg, when main runs, then returns 0 and stdout equals the same canonical bytes as JSON mode', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.txt', LINE_INPUT);

  const result = sut([path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), EXPECTED);
  assert.equal(io.stderr.joined(), '');
});

// ─── structurally-unrecoverable garbage file → returns 2 + stderr prefix ─────

test('Given a file containing structurally-unrecoverable garbage, when main runs, then returns 2 and stderr contains "normalize-findings:"', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('garbage.txt', 'not valid findings at all !!');

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('normalize-findings:'), `stderr was: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── malformed JSON (starts with '[') → returns 2 via the JSON parse branch ──

test('Given a file with malformed JSON starting with "[", when main runs, then returns 2', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('bad.json', '[not valid json');

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('normalize-findings:'), `stderr was: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── nonexistent file path → returns 2 + clean "normalize-findings:" message ─

test('Given a nonexistent file path arg, when main runs, then returns 2 with a clean normalize-findings: message', () => {
  const sut = main;
  const io = makeIo();

  const result = sut(['/no/such/findings/file.json'], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('normalize-findings:'), `stderr was: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── empty-string argv[0] → takes the stdin branch (filePath === null) ────────
// The `|| null` (not `?? null`) means '' falls through to readStdin(); not to
// readFileSync('', ...) which would throw a different error.

test('Given an empty-string argv[0], when main runs, then it calls readStdin (not readFileSync on an empty path)', () => {
  const sut = main;
  const stdinCalled = { value: false };
  const io = {
    stdout: { writes: [], write(s) { io.stdout.writes.push(s); } },
    stderr: { writes: [], write(s) { io.stderr.writes.push(s); } },
    readStdin: () => { stdinCalled.value = true; return JSON_INPUT; },
  };
  io.stdout.joined = () => io.stdout.writes.join('');
  io.stderr.joined = () => io.stderr.writes.join('');

  const result = sut([''], io);

  assert.ok(stdinCalled.value, 'readStdin must be called for an empty-string argv[0]');
  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), EXPECTED);
});

// ─── stdin branch success via injected readStdin → returns 0 + canonical bytes ─

test('Given no file path arg and a readStdin returning JSON, when main runs, then returns 0 and stdout equals canonical bytes', () => {
  const sut = main;
  const io = {
    stdout: { writes: [], write(s) { io.stdout.writes.push(s); } },
    stderr: { writes: [], write(s) { io.stderr.writes.push(s); } },
    readStdin: () => LINE_INPUT,
  };
  io.stdout.joined = () => io.stdout.writes.join('');
  io.stderr.joined = () => io.stderr.writes.join('');

  const result = sut([], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), EXPECTED);
});

// ─── stdin branch error → returns 2 + normalize-findings: message ─────────────

test('Given no file path arg and a readStdin that throws, when main runs, then returns 2 with a normalize-findings: message', () => {
  const sut = main;
  const io = {
    stdout: { writes: [], write(s) { io.stdout.writes.push(s); } },
    stderr: { writes: [], write(s) { io.stderr.writes.push(s); } },
    readStdin: () => { throw new Error('read error'); },
  };
  io.stdout.joined = () => io.stdout.writes.join('');
  io.stderr.joined = () => io.stderr.writes.join('');

  const result = sut([], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('normalize-findings:'), `stderr was: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});
