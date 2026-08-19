import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'adr-lint.js');

function run(...args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

function writeFixture(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

test('Given a clean ADR fixture dir, when the adr-lint bin is spawned, then it exits 0 with the "craft-adr: OK" line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'adrlint-bin-'));
  try {
    writeFixture(dir, 'adr/001-legacy.md', '# 001 — Legacy\n\n- **Status:** accepted\n');

    const result = run(join(dir, 'adr'));

    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('craft-adr: OK'), `stdout was: ${result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given an ADR fixture dir with a C0 violation, when the adr-lint bin is spawned, then it exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'adrlint-bin-'));
  try {
    writeFixture(dir, 'adr/001-broken.md', '---\nsubjects: "not a list"\n---\n# 001 — Broken\n');

    const result = run(join(dir, 'adr'));

    assert.equal(result.status, 2);
    assert.ok(result.stdout.includes('subjects must be a list'), `stdout was: ${result.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
