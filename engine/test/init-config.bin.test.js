/**
 * Subprocess (bin-level) tests for init-config bin.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const bin = join(__dir, '..', 'bin', 'init-config.js');

function run(name) {
  const args = name !== undefined ? [name] : [];
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', cwd: '/tmp' });
}

// ─── valid name → resolve-and-print, exit 0 ───────────────────────────────────

test('Given valid name "my-config", when init-config bin runs, then it exits 0 and prints a relative path to stdout', () => {
  const sut = run;

  const result = sut('my-config');

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.trim().includes('craft-my-config.md'), `stdout was: ${result.stdout}`);
});

// ─── traversal name → reject, exit non-zero ───────────────────────────────────

test('Given traversal name "../escape", when init-config bin runs, then it exits non-zero and writes error to stderr', () => {
  const sut = run;

  const result = sut('../escape');

  assert.notEqual(result.status, 0, 'expected non-zero exit for traversal name');
  assert.ok(result.stderr.trim().length > 0, 'expected error message on stderr');
});
