/**
 * In-process unit tests for contracts-lint-main — drives every failure branch
 * (missing, non-regular-file, empty, retrieval) and the success line so the glue
 * lands in Stryker's mutate scope. The retained child-process smoke is
 * contracts-lint.test.js.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { main } from '../src/contracts-lint-main.js';
import { BUNDLE_VOCAB } from '../src/graph.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';
import { withTempCwd } from '../test-helpers/with-cwd.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REAL_CONTRACTS = join(__dir, '..', '..', 'contracts');
const BUNDLE_NAMES = [...BUNDLE_VOCAB];

const tmpDirs = [];
function mkTmp() {
  const dir = mkdtempSync(join(tmpdir(), 'contracts-lint-main-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function populateContracts(targetDir) {
  for (const name of BUNDLE_NAMES) {
    writeFileSync(join(targetDir, `${name}.md`), `${name} content — invariants here.\n`);
  }
}

function makeFullContractsDir() {
  const dir = mkTmp();
  populateContracts(dir);
  return dir;
}

function runLint(contractsDir) {
  const io = makeCaptureIo();
  const status = main([contractsDir], io);
  return { status, stdout: io.stdout.joined(), stderr: io.stderr.joined() };
}

// ─── missing bundle → 2 ──────────────────────────────────────────────────────

test('Given a contracts dir missing one bundle file, when main runs, then it returns 2 naming the missing bundle', () => {
  const dir = mkTmp();
  const missing = BUNDLE_NAMES[BUNDLE_NAMES.length - 1];
  for (const name of BUNDLE_NAMES.slice(0, -1)) {
    writeFileSync(join(dir, `${name}.md`), `${name} content.\n`);
  }
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes(missing), `stderr should name the missing bundle; got: ${result.stderr}`);
});

// ─── empty bundle → 2 ────────────────────────────────────────────────────────

test('Given a contracts dir with an empty bundle file, when main runs, then it returns 2 naming the empty bundle', () => {
  const dir = makeFullContractsDir();
  writeFileSync(join(dir, 'core.md'), '');
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('core'), `stderr should name the empty bundle; got: ${result.stderr}`);
});

// ─── whitespace-only bundle → 2 (content.trim(), not content ===) ────────────
// Kills the MethodExpression mutant content.trim() === '' → content === '': a file
// of only blanks is empty in spirit; a raw === '' check would let it pass.

test('Given a contracts dir with a whitespace-only bundle file, when main runs, then it returns 2 naming the empty bundle', () => {
  const dir = makeFullContractsDir();
  writeFileSync(join(dir, 'core.md'), '   \n\t\n');
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('core'), `stderr should name the whitespace-only bundle; got: ${result.stderr}`);
});

// ─── non-regular file → 2 ────────────────────────────────────────────────────

test('Given a contracts dir where a bundle path is a directory, when main runs, then it returns 2 flagging the non-regular file', () => {
  const dir = makeFullContractsDir();
  rmSync(join(dir, 'core.md'));
  mkdirSync(join(dir, 'core.md'));
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2);
  assert.ok(result.stderr.toLowerCase().includes('regular file'), `stderr should flag the non-regular file; got: ${result.stderr}`);
});

// ─── retrieval (lowercase) → 2 ───────────────────────────────────────────────

test('Given a contracts dir where one file contains "retrieval", when main runs, then it returns 2', () => {
  const dir = makeFullContractsDir();
  writeFileSync(join(dir, 'producer.md'), 'producer content — retrieval strategy note.\n');
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2);
  assert.ok(result.stderr.toLowerCase().includes('retrieval'), `stderr should mention "retrieval"; got: ${result.stderr}`);
});

// ─── retrieval (uppercase, case-insensitive) → 2 ─────────────────────────────

test('Given a contracts dir where one file contains "RETRIEVAL" uppercase, when main runs, then it returns 2', () => {
  const dir = makeFullContractsDir();
  writeFileSync(join(dir, 'core.md'), 'Never commit. RETRIEVAL is engine-derived.\n');
  const sut = runLint;

  const result = sut(dir);

  assert.equal(result.status, 2);
  assert.ok(result.stderr.toLowerCase().includes('retrieval'), `stderr should mention "retrieval" even uppercase; got: ${result.stderr}`);
});

// ─── real contracts/ dir → 0 + success line ──────────────────────────────────

test('Given the real contracts/ directory, when main runs, then it returns 0 with a "bundles OK" line', () => {
  const sut = runLint;

  const result = sut(REAL_CONTRACTS);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('bundles OK'), `stdout should report the success line; got: ${result.stdout}`);
});

// ─── default contracts dir (argv[0] ?? 'contracts') → resolves a default ──────
// Kills the `?? 'contracts'` nullish-default mutant: with no arg, main resolves
// the literal "contracts" relative to cwd. Run from repo root, that's the real dir.

test('Given no dir arg, when main runs from repo root, then it defaults to the contracts/ directory and returns 0', async () => {
  const io = makeCaptureIo();
  function seedContracts(scratch) {
    const c = join(scratch, 'contracts');
    mkdirSync(c);
    populateContracts(c);
  }

  const result = await withTempCwd(seedContracts, () => main([], io));

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('bundles OK'), `stdout: ${io.stdout.joined()}`);
});
