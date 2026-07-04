import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'stub-lint.js');

function run(...args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

test('Given a clean fixture file, when the stub-lint bin is spawned, then it exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stublint-bin-'));
  try {
    const clean = join(dir, 'clean.js');
    writeFileSync(clean, 'const answer = 42;\n');

    const result = run(clean);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given a fixture file containing a TODO marker and --gate blocking, when the stub-lint bin is spawned, then it exits non-zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stublint-bin-'));
  try {
    const seeded = join(dir, 'seeded.js');
    writeFileSync(seeded, '// TODO fix this\n');

    const result = run('--gate', 'blocking', seeded);

    assert.notEqual(result.status, 0);
    assert.ok(result.stdout.includes('STUB-FOUND'), `stdout was: ${result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
