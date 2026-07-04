import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/prose-lint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const BAN_LIST = ['delve', 'leverage', 'seamless', 'robust', "it's important to note", 'in conclusion'];

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tmpRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'proselint-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFixture(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function slug(entry) {
  return entry.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

// ─── clean file → no findings, exit 0 ────────────────────────────────────────

test('Given a document with no banned entries, when main runs, then it exits 0 with no findings', () => {
  const sut = main;
  const root = tmpRoot();
  const clean = writeFixture(root, 'clean.md', 'A plain sentence with no filler words.\n');
  const io = makeCaptureIo();

  const result = sut([clean], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── same clean document, blocking gate → still exit 0, no stderr noise ─────

test('Given a document with no banned entries, when main runs with --gate blocking, then it exits 0 with empty stdout and stderr', () => {
  const sut = main;
  const root = tmpRoot();
  const clean = writeFixture(root, 'clean-blocking.md', 'A plain sentence with no filler words.\n');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', clean], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
  assert.equal(io.stderr.joined(), '');
});

// ─── single-token entry → a finding, advisory exit 0 ─────────────────────────

test('Given a document containing "delve", when main runs advisory, then it reports a finding and exits 0', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'seeded.md', 'Let us delve into the details.\n');
  const io = makeCaptureIo();

  const result = sut([seeded], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes(`SLOP-FOUND(${seeded}): delve`), `stdout was: ${io.stdout.joined()}`);
});

// ─── case-insensitive positive: a capitalized single-token entry still matches ─

test('Given a document containing the capitalized word "Delve", when main runs, then it reports a finding for the lowercase entry', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'capitalized.md', 'Delve into it.\n');
  const io = makeCaptureIo();

  const result = sut([seeded], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes(`SLOP-FOUND(${seeded}): delve`), `stdout was: ${io.stdout.joined()}`);
});

// ─── word-boundary negative: a single-token entry never fires inside a longer word ─

test('Given a document containing "robustness", when main runs, then it reports no finding for "robust"', () => {
  const sut = main;
  const root = tmpRoot();
  const decoy = writeFixture(root, 'decoy.md', 'The system shows great robustness.\n');
  const io = makeCaptureIo();

  const result = sut([decoy], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── multi-word phrase entry → literal substring match ───────────────────────

test('Given a document containing the phrase "it\'s important to note", when main runs, then it reports a finding for that entry', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'phrase.md', "It's important to note that this matters.\n");
  const io = makeCaptureIo();

  const result = sut([seeded], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stdout.joined().includes(`SLOP-FOUND(${seeded}): it's important to note`),
    `stdout was: ${io.stdout.joined()}`,
  );
});

// ─── blocking gate → EXIT_FOUND ───────────────────────────────────────────────

test('Given a document containing "seamless", when main runs with --gate blocking, then it exits non-zero', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'seeded.md', 'A seamless integration.\n');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', seeded], io);

  assert.equal(result, 2);
});

// ─── waiver clears a blocking finding ────────────────────────────────────────

test('Given a waiver source waiving the seeded document, when main runs with --gate blocking, then it exits 0 with no findings', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'seeded.md', 'A seamless integration.\n');
  const waiverSource = writeFixture(root, 'waiver.md', `SLOP-WAIVE(${seeded}): tracked elsewhere\n`);
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', '--waiver-source', waiverSource, seeded], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── unreadable waiver source → loud stderr, run still completes ────────────

test('Given an unreadable --waiver-source path, when main runs alongside a clean document, then it reports "cannot read waiver source" on stderr and completes', () => {
  const sut = main;
  const root = tmpRoot();
  const clean = writeFixture(root, 'clean-waiver.md', 'A plain sentence with no filler words.\n');
  const missingWaiver = join(root, 'missing-waiver.md');
  const io = makeCaptureIo();

  const result = sut(['--waiver-source', missingWaiver, clean], io);

  assert.equal(result, 0);
  assert.ok(io.stderr.joined().includes('cannot read waiver source'), `stderr was: ${io.stderr.joined()}`);
});

// ─── unreadable file path ─────────────────────────────────────────────────────

test('Given a file path that does not exist, when main runs advisory, then it reports "cannot read" on stderr and exits 0', () => {
  const sut = main;
  const root = tmpRoot();
  const missing = join(root, 'does-not-exist.md');
  const io = makeCaptureIo();

  const result = sut([missing], io);

  assert.equal(result, 0);
  assert.ok(io.stderr.joined().includes(`cannot read ${missing}`), `stderr was: ${io.stderr.joined()}`);
});

test('Given a file path that does not exist, when main runs with --gate blocking, then it exits non-zero', () => {
  const sut = main;
  const root = tmpRoot();
  const missing = join(root, 'does-not-exist.md');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', missing], io);

  assert.equal(result, 2);
});

// ─── PR-body surface: a non-.md argv file is scanned the same as a doc ───────

test('Given a PR-body stand-in file containing a banned entry, when main runs, then it reports a finding for that file', () => {
  const sut = main;
  const root = tmpRoot();
  const prBody = writeFixture(root, 'pr-body', 'This change is a seamless drop-in.\n');
  const io = makeCaptureIo();

  const result = sut([prBody], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes(`SLOP-FOUND(${prBody}): seamless`), `stdout was: ${io.stdout.joined()}`);
});

// ─── self-exclusion ───────────────────────────────────────────────────────────

test("Given the module's own source file as an argv path, when main runs with --gate blocking, then it exits 0 with no findings", () => {
  const sut = main;
  const selfPath = fileURLToPath(new URL('../src/prose-lint-main.js', import.meta.url));
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', selfPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── generative: every entry embedded (even twice) yields exactly one finding ─

test('Given a document embedding each banned entry twice, when main runs, then each entry yields exactly one finding', () => {
  const sut = main;
  const root = tmpRoot();

  for (const entry of BAN_LIST) {
    const doc = writeFixture(root, `${slug(entry)}.md`, `${entry} appears here, and again: ${entry}.\n`);
    const io = makeCaptureIo();

    const result = sut([doc], io);

    const marker = `SLOP-FOUND(${doc}): ${entry}`;
    const occurrences = io.stdout.joined().split(marker).length - 1;
    assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
    assert.equal(occurrences, 1, `stdout was: ${io.stdout.joined()}`);
  }
});

test('Given a slop phrase embedded inside a larger word, when main runs, then the substring match still flags it', () => {
  const sut = main;
  const root = tmpRoot();
  const doc = writeFixture(root, 'phrase-substring.md', 'Summing up in conclusionary remarks here.\n');
  const io = makeCaptureIo();

  const result = sut([doc], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(
    io.stdout.joined().includes(`SLOP-FOUND(${doc}): in conclusion`),
    `expected the phrase to match as a substring; stdout was: ${io.stdout.joined()}`,
  );
});

test('Given a SLOP-WAIVE token with interior padding around the path, when main runs with --gate blocking, then it still clears the finding', () => {
  const sut = main;
  const root = tmpRoot();
  const seeded = writeFixture(root, 'padded.md', 'We delve into this.\n');
  const waiverSource = writeFixture(root, 'padded-waiver.md', `SLOP-WAIVE(  ${seeded}  ): tracked elsewhere\n`);
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', '--waiver-source', waiverSource, seeded], io);

  assert.equal(result, 0, `expected the trimmed padded path to clear; stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});
