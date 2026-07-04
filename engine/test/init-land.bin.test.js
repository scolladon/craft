/**
 * Subprocess (bin-level) tests for init-land bin. Exercises the real manifest-lint
 * script end to end — this pins the portability contract: fileExists ROOT =
 * dirname(dirname(tmpPath)), so a ref-bearing config lints clean at a repo root
 * (where the ref exists) but is REJECTED at $HOME (where it doesn't).
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const bin = join(__dir, '..', 'bin', 'init-land.js');

const tmpDirs = [];

function makeTmpDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

process.on('exit', () => {
  for (const dir of tmpDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

function run(args, options) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...options });
}

test('Given local scope with a lint-clean tmp under cwd/.claude, when bin runs, then it exits 0 and lands at <cwd>/.claude/craft-<name>.md', () => {
  const cwd = makeTmpDir('init-land-cwd-');
  mkdirSync(join(cwd, '.claude'));
  const tmpPath = join(cwd, '.claude', '.craft-x.tmp');
  writeFileSync(tmpPath, '# named config — no frontmatter, pure defaults\n');
  const sut = run;

  const result = sut([tmpPath, 'x', '--scope', 'local'], { cwd });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const finalPath = join(cwd, '.claude', 'craft-x.md');
  assert.ok(existsSync(finalPath), 'final path must exist after successful move');
  assert.ok(!existsSync(tmpPath), 'tmp path must not exist after successful move');
});

test('Given no --scope flag with a lint-clean tmp under cwd/.claude, when bin runs, then it defaults to local scope and exits 0', () => {
  const cwd = makeTmpDir('init-land-cwd-');
  mkdirSync(join(cwd, '.claude'));
  const tmpPath = join(cwd, '.claude', '.craft-x.tmp');
  writeFileSync(tmpPath, '# named config — no frontmatter, pure defaults\n');
  const sut = run;

  const result = sut([tmpPath, 'x'], { cwd });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(existsSync(join(cwd, '.claude', 'craft-x.md')), 'final path must exist after successful move');
});

test('Given user scope with a ref-bearing tmp at $HOME/.claude, when bin runs, then real manifest-lint rejects the missing ref at $HOME and no user file is created', () => {
  const home = makeTmpDir('init-land-home-');
  const cwd = makeTmpDir('init-land-cwd-');
  mkdirSync(join(home, '.claude'));
  const tmpPath = join(home, '.claude', '.craft-x.tmp');
  writeFileSync(tmpPath, '---\ncontext: docs/missing.md\n---\n');
  const sut = run;

  const result = sut([tmpPath, 'x', '--scope', 'user'], { cwd, env: { ...process.env, HOME: home } });

  assert.notEqual(result.status, 0, `expected non-zero; stdout: ${result.stdout}`);
  assert.ok(!existsSync(join(home, '.claude', 'craft-x.md')), 'ref-bearing config must not be landed at $HOME');
});

test('Given user scope with a ref-free tmp at $HOME/.claude, when bin runs, then it exits 0 and lands at $HOME/.claude/craft-<name>.md', () => {
  const home = makeTmpDir('init-land-home-');
  const cwd = makeTmpDir('init-land-cwd-');
  mkdirSync(join(home, '.claude'));
  const tmpPath = join(home, '.claude', '.craft-x.tmp');
  writeFileSync(tmpPath, '# named config — no frontmatter, pure defaults\n');
  const sut = run;

  const result = sut([tmpPath, 'x', '--scope', 'user'], { cwd, env: { ...process.env, HOME: home } });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const finalPath = join(home, '.claude', 'craft-x.md');
  assert.ok(existsSync(finalPath), 'final path must exist after successful move');
  assert.ok(!existsSync(tmpPath), 'tmp path must not exist after successful move');
});

test('Given user scope, a ref-bearing tmp, and a prior user file already landed, when bin runs, then lint rejects the new tmp and the prior file is untouched byte-for-byte', () => {
  const home = makeTmpDir('init-land-home-');
  const cwd = makeTmpDir('init-land-cwd-');
  mkdirSync(join(home, '.claude'));
  const finalPath = join(home, '.claude', 'craft-x.md');
  const priorContent = '# prior clean config\n';
  writeFileSync(finalPath, priorContent);
  const tmpPath = join(home, '.claude', '.craft-x.tmp');
  writeFileSync(tmpPath, '---\ncontext: docs/missing.md\n---\n');
  const sut = run;

  const result = sut([tmpPath, 'x', '--scope', 'user'], { cwd, env: { ...process.env, HOME: home } });

  assert.notEqual(result.status, 0, `expected non-zero; stdout: ${result.stdout}`);
  assert.equal(readFileSync(finalPath, 'utf8'), priorContent, 'prior user file must be untouched byte-for-byte');
});

test('Given no argv, when bin runs without required args, then it exits non-zero with a usage message on stderr', () => {
  const sut = run;

  const result = sut([]);

  assert.notEqual(result.status, 0, 'expected non-zero exit for missing args');
  assert.ok(result.stderr.trim().length > 0, 'expected error message on stderr');
});

test('Given an unknown --scope value, when bin runs, then it exits non-zero with a stderr diagnostic', () => {
  const dir = makeTmpDir('init-land-bin-');
  const tmpPath = join(dir, '.craft-x.tmp');
  writeFileSync(tmpPath, '# clean\n');
  const sut = run;

  const result = sut([tmpPath, 'x', '--scope', 'global']);

  assert.notEqual(result.status, 0, 'expected non-zero exit for unknown --scope');
  assert.ok(result.stderr.trim().length > 0, 'expected error message on stderr');
});
