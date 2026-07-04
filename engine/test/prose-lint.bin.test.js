import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'prose-lint.js');

function run(...args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

test('Given a clean fixture document, when the prose-lint bin is spawned, then it exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'proselint-bin-'));
  try {
    const clean = join(dir, 'clean.md');
    writeFileSync(clean, 'A plain sentence with no filler words.\n');

    const result = run(clean);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given a fixture document containing "seamless" and --gate blocking, when the prose-lint bin is spawned, then it exits non-zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'proselint-bin-'));
  try {
    const seeded = join(dir, 'seeded.md');
    writeFileSync(seeded, 'A seamless integration.\n');

    const result = run('--gate', 'blocking', seeded);

    assert.notEqual(result.status, 0);
    assert.ok(result.stdout.includes('SLOP-FOUND'), `stdout was: ${result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
