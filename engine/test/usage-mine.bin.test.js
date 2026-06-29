/**
 * Subprocess smoke tests for usage-mine bin shim.
 * Mirrors the pattern from init-emit.bin.test.js: spawnSync the shim from a
 * mkdtemp cwd so report.json / report.md are written to a throwaway dir.
 * Given/When/Then titles, AAA bodies, sut variable.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'usage-mine.js');
// Telemetry fixture dir (under engine/test/fixtures/telemetry/) — used as --dir.
// Containment will reject it (not under ~/.claude/projects), which is correct advisory
// no-op behaviour; the bin still exits 0 and writes a no-op report to the cwd.
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'telemetry');

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function makeTmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'usage-mine-bin-'));
  tmpDirs.push(dir);
  return dir;
}

function runBin(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 15000,
  });
}

// ─── 9. Bin smoke — exits 0 and report.json + report.md exist ────────────────

test('Given a fixture dir passed to the usage-mine bin, when the bin runs, then it exits 0 and report.json and report.md exist inside the cwd repo', () => {
  const sut = runBin;
  const repoRoot = makeTmpRepo();

  const result = sut(['--dir', FIXTURE_DIR], repoRoot);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(existsSync(join(repoRoot, 'report.json')), 'report.json must exist');
  assert.ok(existsSync(join(repoRoot, 'report.md')), 'report.md must exist');
});

test('Given no arguments to the usage-mine bin, when the bin runs, then it exits 0 (advisory no-op)', () => {
  const sut = runBin;
  const repoRoot = makeTmpRepo();

  const result = sut([], repoRoot);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
});

// ─── 10. No-leak — report.json contains no absolute paths, $HOME, username ───

test('Given the produced report.json, when scanned, then it contains no absolute path, no $HOME, no username', () => {
  const sut = runBin;
  const repoRoot = makeTmpRepo();
  sut(['--dir', FIXTURE_DIR], repoRoot);

  const raw = readFileSync(join(repoRoot, 'report.json'), 'utf8');
  const home = process.env.HOME ?? '';
  const user = process.env.USER ?? process.env.LOGNAME ?? '';

  assert.ok(!raw.includes(FIXTURE_DIR), 'report must not contain the input dir path');
  if (home) assert.ok(!raw.includes(home), `report must not contain $HOME (${home})`);
  if (user) assert.ok(!raw.includes(`/${user}/`), `report must not contain username path segment /${user}/`);
});

test('Given the produced report.json, when parsed, then it has schemaVersion 1 and a runs array', () => {
  const sut = runBin;
  const repoRoot = makeTmpRepo();
  sut(['--dir', FIXTURE_DIR], repoRoot);

  const report = JSON.parse(readFileSync(join(repoRoot, 'report.json'), 'utf8'));

  assert.equal(report.schemaVersion, 1);
  assert.ok(Array.isArray(report.runs));
});
