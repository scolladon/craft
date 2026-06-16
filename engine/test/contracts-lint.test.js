import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { BUNDLE_VOCAB } from '../src/graph.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dir, '..', 'bin', 'contracts-lint.js');
const REAL_CONTRACTS = join(__dir, '..', '..', 'contracts');

// Single vocab home — never re-list the bundle names; derive from the engine's set.
const BUNDLE_NAMES = [...BUNDLE_VOCAB];

const tmpDirs = [];
function mkTmp() {
  const dir = mkdtempSync(join(tmpdir(), 'contracts-lint-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function makeFullContractsDir() {
  const dir = mkTmp();
  for (const name of BUNDLE_NAMES) {
    writeFileSync(join(dir, `${name}.md`), `${name} content — invariants here.\n`);
  }
  return dir;
}

function runLint(contractsDir) {
  return spawnSync(process.execPath, [BIN, contractsDir], { encoding: 'utf8' });
}

// ─── Given a temp dir missing one bundle → exit 2 ────────────────────────────

test('Given a contracts dir missing one bundle file, when contracts-lint runs, then it exits 2 with a clear message', () => {
  const dir = mkTmp();
  const presentBundles = BUNDLE_NAMES.slice(0, -1); // all except the last (insertion order)
  const missing = BUNDLE_NAMES[BUNDLE_NAMES.length - 1];
  for (const name of presentBundles) {
    writeFileSync(join(dir, `${name}.md`), `${name} content.\n`);
  }
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2, 'should exit 2 when a bundle file is missing');
  assert.ok(
    result.stderr.includes(missing),
    `stderr should name the missing bundle; got: ${result.stderr}`,
  );
});

test('Given a contracts dir with an empty bundle file, when contracts-lint runs, then it exits 2 with a clear message', () => {
  const dir = makeFullContractsDir();
  writeFileSync(join(dir, 'core.md'), '');
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2, 'should exit 2 when a bundle file is empty');
  assert.ok(
    result.stderr.includes('core'),
    `stderr should name the empty bundle; got: ${result.stderr}`,
  );
});

// ─── Given a bundle path that is not a regular file → exit 2 ─────────────────

test('Given a contracts dir where a bundle path is a directory, when contracts-lint runs, then it exits 2 (not a regular file)', () => {
  const dir = makeFullContractsDir();
  rmSync(join(dir, 'core.md'));
  mkdirSync(join(dir, 'core.md'));
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2, 'should exit 2 when a bundle path is not a regular file');
  assert.ok(
    result.stderr.toLowerCase().includes('regular file'),
    `stderr should flag the non-regular file; got: ${result.stderr}`,
  );
});

// ─── Given a dir with a retrieval string → exit 2 ───────────────────────────

test('Given a contracts dir where one file contains the word "retrieval", when contracts-lint runs, then it exits 2', () => {
  const dir = makeFullContractsDir();
  writeFileSync(join(dir, 'producer.md'), 'producer content — retrieval strategy note.\n');
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2, 'should exit 2 when a bundle contains "retrieval"');
  assert.ok(
    result.stderr.toLowerCase().includes('retrieval'),
    `stderr should mention "retrieval"; got: ${result.stderr}`,
  );
});

test('Given a contracts dir where one file contains "RETRIEVAL" in uppercase, when contracts-lint runs, then it exits 2 naming retrieval', () => {
  const dir = makeFullContractsDir();
  writeFileSync(join(dir, 'core.md'), 'Never commit. RETRIEVAL is engine-derived.\n');
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2, 'should exit 2 for case-insensitive retrieval match');
  assert.ok(
    result.stderr.toLowerCase().includes('retrieval'),
    `stderr should mention "retrieval" even for an uppercase match; got: ${result.stderr}`,
  );
});

// ─── Given the real contracts/ dir → exit 0 ─────────────────────────────────

test('Given the real contracts/ directory with all valid bundles, when contracts-lint runs, then it exits 0 with a success line', () => {
  const sut = runLint;

  const result = sut(REAL_CONTRACTS);

  assert.equal(
    result.status,
    0,
    `contracts-lint should pass on the real contracts/ dir; stderr: ${result.stderr}`,
  );
  assert.ok(
    result.stdout.includes('bundles OK'),
    `stdout should report the success line; got: ${result.stdout}`,
  );
});
