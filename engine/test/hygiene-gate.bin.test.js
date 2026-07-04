import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'hygiene-gate.js');

function run(...args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

function tmpManifest(content) {
  const dir = mkdtempSync(join(tmpdir(), 'hygienegate-bin-'));
  const file = join(dir, 'workflow.md');
  writeFileSync(file, content);
  return { dir, file };
}

test('Given a manifest with hygiene.gate blocking, when the bin is spawned, then it prints blocking and exits 0', () => {
  const { dir, file } = tmpManifest('---\nhygiene:\n  gate: blocking\n---\n');
  try {
    const result = run(file);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, 'blocking\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given a manifest with an invalid hygiene.gate, when the bin is spawned, then it exits non-zero and propagates the failure', () => {
  const { dir, file } = tmpManifest('---\nhygiene:\n  gate: bogus\n---\n');
  try {
    const result = run(file);

    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('unknown hygiene gate'), `stderr: ${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
