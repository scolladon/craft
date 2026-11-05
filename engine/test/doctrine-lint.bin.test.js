import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'doctrine-lint.js');

const VALID_DOCTRINE = [
  '# Doctrine',
  '',
  '## D-1 — A title',
  '- **Trigger:** a trigger',
  '- **Rule:** a rule',
  '- **Evidence:** ADR-546 — why',
  '- **Counter-cases:** none',
  '',
].join('\n');

function runWithDoctrine(content) {
  const root = mkdtempSync(join(tmpdir(), 'doctrinelint-bin-'));
  try {
    mkdirSync(join(root, 'adr'));
    writeFileSync(join(root, 'adr', '546-first.md'), '# ADR\n\n- **Status:** accepted\n');
    writeFileSync(join(root, 'doctrine.md'), content);
    return spawnSync(process.execPath, [BIN, 'doctrine.md', 'adr'], { encoding: 'utf8', cwd: root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('Given a valid doctrine and ADR dir, when the doctrine-lint bin is spawned, then it exits 0 with the OK line', () => {
  const sut = runWithDoctrine;

  const result = sut(VALID_DOCTRINE);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('doctrine-lint: 1 entries, 1 ADR citations — OK'));
});

test('Given an invalid doctrine, when the doctrine-lint bin is spawned, then it exits 2', () => {
  const sut = runWithDoctrine;

  const result = sut('## nonsense\n');

  assert.equal(result.status, 2);
  assert.ok(result.stdout.includes('doctrine-lint: doctrine.md:1:'));
});

test('Given the bin imported as a module, when loaded, then main does not run', () => {
  const sut = pathToFileURL(BIN).href;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(sut)})`], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
