/**
 * Subprocess (bin-level) tests for init-land bin.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const bin = join(__dir, '..', 'bin', 'init-land.js');

const tmpDirs = [];

function makeTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'init-land-bin-'));
  tmpDirs.push(dir);
  return dir;
}

process.on('exit', () => {
  for (const dir of tmpDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

test('Given valid tmp and final paths with a lint-clean manifest, when bin runs, then it exits 0 and file is moved to final path', () => {
  const dir = makeTmpDir();
  const tmpPath = join(dir, 'manifest.tmp');
  const finalPath = join(dir, 'manifest.final');
  writeFileSync(tmpPath, '# named config — no frontmatter, pure defaults\n');
  const sut = run;

  const result = sut([tmpPath, finalPath]);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(existsSync(finalPath), 'finalPath must exist after successful move');
  assert.ok(!existsSync(tmpPath), 'tmpPath must not exist after successful move');
});

test('Given tmp with an invalid manifest, when bin runs and lint fails, then it exits non-zero and final path is not created', () => {
  const dir = makeTmpDir();
  const tmpPath = join(dir, 'manifest.tmp');
  const finalPath = join(dir, 'manifest.final');
  writeFileSync(tmpPath, '---\nbacklog:\n  source: invalid-nonexistent-tracker\n---\n');
  const sut = run;

  const result = sut([tmpPath, finalPath]);

  assert.notEqual(result.status, 0, 'expected non-zero exit on lint failure');
  assert.ok(!existsSync(finalPath), 'finalPath must not be created when lint fails');
});

test('Given no argv, when bin runs without required paths, then it exits non-zero with a usage message on stderr', () => {
  const sut = run;

  const result = sut([]);

  assert.notEqual(result.status, 0, 'expected non-zero exit for missing args');
  assert.ok(result.stderr.trim().length > 0, 'expected error message on stderr');
});
