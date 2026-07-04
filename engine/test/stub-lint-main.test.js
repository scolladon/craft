import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/stub-lint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const MARKERS = ['TODO', 'FIXME', 'HACK', 'XXX', 'PLACEHOLDER', 'STUB'];

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tmpRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'stublint-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFixture(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

// ─── clean file → no findings, exit 0 ────────────────────────────────────────

test('Given a file with no stub markers, when main runs, then it exits 0 with no findings', () => {
  const sut = main;
  const root = tmpRoot();
  const clean = writeFixture(root, 'clean.js', 'const answer = 42;\n');
  const io = makeCaptureIo();

  const result = sut([clean], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── same clean file, blocking gate → still exit 0, no stderr noise ─────────

test('Given a file with no stub markers, when main runs with --gate blocking, then it exits 0 with empty stdout and stderr', () => {
  const sut = main;
  const root = tmpRoot();
  const clean = writeFixture(root, 'clean-blocking.js', 'const answer = 42;\n');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', clean], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
  assert.equal(io.stderr.joined(), '');
});

// ─── two markers on separate lines → two findings, advisory exit 0 ──────────

test('Given a file with TODO and FIXME markers on separate lines, when main runs advisory, then it prints two findings and exits 0', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'seeded.js', '// TODO fix this\nconst x = 1;\n// FIXME later\n');
  const io = makeCaptureIo();

  const result = sut([seeded], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes(`STUB-FOUND(${seeded}): TODO@L1`), `stdout was: ${io.stdout.joined()}`);
  assert.ok(io.stdout.joined().includes(`STUB-FOUND(${seeded}): FIXME@L3`), `stdout was: ${io.stdout.joined()}`);
});

// ─── same seeded file, blocking gate → EXIT_FOUND ────────────────────────────

test('Given a file with a TODO marker, when main runs with --gate blocking, then it exits non-zero', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'seeded.js', '// TODO fix this\n');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', seeded], io);

  assert.equal(result, 2);
});

// ─── waiver clears a blocking finding ────────────────────────────────────────

test('Given a waiver source waiving the seeded file, when main runs with --gate blocking, then it exits 0 with no findings', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'seeded.js', '// TODO fix this\n');
  const waiverSource = writeFixture(root, 'waiver.md', `STUB-WAIVE(${seeded}): tracked elsewhere\n`);
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', '--waiver-source', waiverSource, seeded], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── unreadable waiver source → loud stderr, run still completes ────────────

test('Given an unreadable --waiver-source path, when main runs alongside a clean file, then it reports "cannot read waiver source" on stderr and completes', () => {
  const sut = main;
  const root = tmpRoot();
  const clean = writeFixture(root, 'clean-waiver.js', 'const answer = 42;\n');
  const missingWaiver = join(root, 'missing-waiver.md');
  const io = makeCaptureIo();

  const result = sut(['--waiver-source', missingWaiver, clean], io);

  assert.equal(result, 0);
  assert.ok(io.stderr.joined().includes('cannot read waiver source'), `stderr was: ${io.stderr.joined()}`);
});

// ─── word-boundary negative: marker substrings inside larger words never fire ─

test('Given a file containing STUBBORN and TODOLIST, when main runs, then it finds nothing', () => {
  const sut = main;
  const root = tmpRoot();
  const decoy = writeFixture(root, 'decoy.js', 'const STUBBORN = 1;\nconst TODOLIST = 2;\n');
  const io = makeCaptureIo();

  const result = sut([decoy], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── case-insensitive positive: lowercase marker still matches, upper-cased in output ─

test('Given a file containing a lowercase "todo", when main runs, then it reports an upper-cased TODO finding', () => {
  const sut = main;
  const root = tmpRoot();
  const lower = writeFixture(root, 'lower.js', '// todo revisit\n');
  const io = makeCaptureIo();

  const result = sut([lower], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes(`STUB-FOUND(${lower}): TODO@L1`), `stdout was: ${io.stdout.joined()}`);
});

// ─── unreadable file path ─────────────────────────────────────────────────────

test('Given a file path that does not exist, when main runs advisory, then it reports "cannot read" on stderr and exits 0', () => {
  const sut = main;
  const root = tmpRoot();
  const missing = join(root, 'does-not-exist.js');
  const io = makeCaptureIo();

  const result = sut([missing], io);

  assert.equal(result, 0);
  assert.ok(io.stderr.joined().includes(`cannot read ${missing}`), `stderr was: ${io.stderr.joined()}`);
});

test('Given a file path that does not exist, when main runs with --gate blocking, then it exits non-zero', () => {
  const sut = main;
  const root = tmpRoot();
  const missing = join(root, 'does-not-exist.js');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', missing], io);

  assert.equal(result, 2);
});

// ─── self-exclusion ───────────────────────────────────────────────────────────

test("Given the module's own source file as an argv path, when main runs with --gate blocking, then it exits 0 with no findings", () => {
  const sut = main;
  const selfPath = fileURLToPath(new URL('../src/stub-lint-main.js', import.meta.url));
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', selfPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── generative: every marker fires standalone, none fires glued into a larger token ─

test('Given each marker embedded standalone versus glued into a larger token, when main runs, then only the standalone form is ever a finding', () => {
  const sut = main;
  const root = tmpRoot();

  for (const marker of MARKERS) {
    const standalone = writeFixture(root, `${marker.toLowerCase()}-standalone.js`, `x ${marker} y\n`);
    const glued = writeFixture(root, `${marker.toLowerCase()}-glued.js`, `x${marker}y\n`);
    const io = makeCaptureIo();

    const result = sut([standalone, glued], io);

    assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
    assert.ok(io.stdout.joined().includes(`STUB-FOUND(${standalone}): ${marker}@L1`), `stdout was: ${io.stdout.joined()}`);
    assert.ok(!io.stdout.joined().includes(`STUB-FOUND(${glued}):`), `stdout was: ${io.stdout.joined()}`);
  }
});

test('Given a STUB-WAIVE token with interior padding around the path, when main runs with --gate blocking, then it still clears the finding', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'padded.js', '// TODO wire this up\n');
  const waiverSource = writeFixture(root, 'padded-waiver.md', `STUB-WAIVE(  ${seeded}  ): tracked elsewhere\n`);
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', '--waiver-source', waiverSource, seeded], io);

  assert.equal(result, 0, `expected the trimmed padded path to clear; stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});
