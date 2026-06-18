import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const bin = join(__dir, '..', 'bin', 'manifest-lint.js');
const manifestsDir = join(__dir, 'fixtures', 'manifests');

function run(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

// ─── absent path → exit 0 (real entrypoint wires argv correctly) ─────────────

test('Given a nonexistent manifest path, when the manifest-lint bin runs, then it exits 0', () => {
  const sut = run;

  const result = sut('/no/such/workflow.md');

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('no manifest at'), `stdout was: ${result.stdout}`);
});

// ─── valid manifest → exit 0 ─────────────────────────────────────────────────

test('Given a valid manifest, when the manifest-lint bin runs, then it exits 0', () => {
  const sut = run;
  const manifestPath = join(manifestsDir, 'with-body.md');

  const result = sut(manifestPath);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('valid.'), `stdout was: ${result.stdout}`);
});
