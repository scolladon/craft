import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'intention-lint.js');

function run(...paths) {
  return spawnSync(process.execPath, [BIN, ...paths], { encoding: 'utf8' });
}

test('Given a clean fixture corpus, when the intention-lint bin is spawned, then it exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentionlint-bin-'));
  try {
    const page = join(dir, 'clean.md');
    writeFileSync(page, "---\nsubjects: ['engine/src/foo/**']\n---\n# Clean\n");

    const result = run(page);

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('craft-intention: OK'), `stdout was: ${result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given a seeded violation (mis-typed subjects), when the intention-lint bin is spawned, then it exits non-zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intentionlint-bin-'));
  try {
    const page = join(dir, 'bad.md');
    writeFileSync(page, '---\nsubjects: [unclosed\n---\n# Bad\n');

    const result = run(page);

    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('craft-intention:'), `stderr was: ${result.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
