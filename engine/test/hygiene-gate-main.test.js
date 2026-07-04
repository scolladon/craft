import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/hygiene-gate-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tmpManifest(content) {
  const dir = mkdtempSync(join(tmpdir(), 'hygienegate-'));
  tmpDirs.push(dir);
  const file = join(dir, 'workflow.md');
  writeFileSync(file, content);
  return file;
}

test('Given a missing manifest path, when main runs, then it prints advisory, exits 0, and stays silent', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([join(tmpdir(), 'no-such-manifest-xyz.md')], io);

  assert.equal(result, 0);
  assert.equal(io.stdout.joined().trim(), 'advisory');
  assert.equal(io.stderr.joined(), '', 'an absent manifest is the zero-config case — no noise');
});

test('Given a manifest file with no frontmatter block, when main runs, then it resolves to advisory and exits 0', () => {
  const sut = main;
  const file = tmpManifest('# a plain markdown manifest, no frontmatter\n');
  const io = makeCaptureIo();

  const result = sut([file], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined().trim(), 'advisory');
});

test('Given no manifest path argument, when main runs, then it prints advisory and exits 0', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io);

  assert.equal(result, 0);
  assert.equal(io.stdout.joined().trim(), 'advisory');
});

test('Given a manifest with no hygiene block, when main runs, then it resolves to advisory', () => {
  const sut = main;
  const file = tmpManifest('---\nphases: {}\n---\n\n# manifest\n');
  const io = makeCaptureIo();

  const result = sut([file], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined().trim(), 'advisory');
});

test('Given a manifest with hygiene.gate blocking, when main runs, then it resolves to blocking', () => {
  const sut = main;
  const file = tmpManifest('---\nhygiene:\n  gate: blocking\n---\n\n# manifest\n');
  const io = makeCaptureIo();

  const result = sut([file], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined().trim(), 'blocking');
});

test('Given a manifest with hygiene.gate advisory, when main runs, then it resolves to advisory', () => {
  const sut = main;
  const file = tmpManifest('---\nhygiene:\n  gate: advisory\n---\n');
  const io = makeCaptureIo();

  const result = sut([file], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined().trim(), 'advisory');
});

test('Given a manifest with malformed YAML frontmatter, when main runs, then it fails open to advisory with a parse note and exit 0', () => {
  const sut = main;
  const file = tmpManifest('---\nhygiene:\n  gate: [unbalanced\n---\n');
  const io = makeCaptureIo();

  const result = sut([file], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined().trim(), 'advisory');
  assert.ok(io.stderr.joined().includes('cannot parse'), `stderr: ${io.stderr.joined()}`);
});

test('Given a manifest with an unknown hygiene.gate value, when main runs, then it exits non-zero and does not print a gate', () => {
  const sut = main;
  const file = tmpManifest('---\nhygiene:\n  gate: bogus\n---\n');
  const io = makeCaptureIo();

  const result = sut([file], io);

  assert.notEqual(result, 0);
  assert.ok(io.stderr.joined().includes('bogus'), `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined().trim(), '');
});
