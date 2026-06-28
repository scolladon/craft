import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'dod-assert.js');
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(dodContent, greenCsv) {
  const dir = mkdtempSync(join(tmpdir(), 'dod-assert-bin-'));
  try {
    const dodPath = join(dir, 'DOD.md');
    writeFileSync(dodPath, dodContent);
    return spawnSync(process.execPath, [BIN, dodPath, REPO_ROOT, greenCsv ?? ''], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Given a structured DoD with a green gate criterion, when the bin is spawned, then it exits 0 and reports met', () => {
  const result = run('---\ncriteria:\n  - id: gate-check\n    kind: auto\n    assert:\n      gate: review\n---\n', 'review');

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(JSON.parse(result.stdout).outcomes, [{ id: 'gate-check', kind: 'auto', outcome: 'met' }]);
});

test('Given a free-text DoD, when the bin is spawned, then it exits 0 and reports null outcomes', () => {
  const result = run('# Definition of Done\n\n- ship it\n', '');

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.deepEqual(JSON.parse(result.stdout), { outcomes: null });
});
