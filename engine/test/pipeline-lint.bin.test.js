import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const bin = join(__dir, '..', 'bin', 'pipeline-lint.js');
const DEFAULT_PIPELINE = join(__dir, '..', '..', 'pipeline', 'default.yml');

function run(...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

// ─── real default pipeline → exit 0 (entrypoint wires argv correctly) ─────────

test('Given the real default pipeline, when the pipeline-lint bin runs, then it exits 0', () => {
  const sut = run;

  const result = sut(DEFAULT_PIPELINE);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
});

// ─── no arg → exit 2 + usage ─────────────────────────────────────────────────

test('Given no path arg, when the pipeline-lint bin runs, then it exits 2 with a usage line', () => {
  const sut = run;

  const result = sut();

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('Usage: pipeline-lint'), `stderr was: ${result.stderr}`);
});
