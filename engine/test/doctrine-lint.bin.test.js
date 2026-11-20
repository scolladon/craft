import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
  '- **Evidence:** R-546 — why',
  '- **Counter-cases:** none',
  '',
].join('\n');

function runWithDoctrine(content) {
  const root = mkdtempSync(join(tmpdir(), 'doctrinelint-bin-'));
  try {
    writeFileSync(join(root, 'register.md'), '# Rulings\n\n- R-546 [] A statement.\n');
    writeFileSync(join(root, 'doctrine.md'), content);
    return spawnSync(process.execPath, [BIN, 'doctrine.md', 'register.md'], { encoding: 'utf8', cwd: root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('Given a valid doctrine and register, when the doctrine-lint bin is spawned, then it exits 0 with the OK line', () => {
  const sut = runWithDoctrine;

  const result = sut(VALID_DOCTRINE);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, 'doctrine-lint: 1 entries, 1 ruling citations — OK\n');
});

test('Given an invalid doctrine, when the doctrine-lint bin is spawned, then it exits 2', () => {
  const sut = runWithDoctrine;

  const result = sut('## nonsense\n');

  assert.equal(result.status, 2);
  assert.equal(result.stdout, 'doctrine-lint: doctrine.md:1: heading must be "## D-<n> — <title>"\n');
});

test('Given the bin imported as a module, when loaded, then main does not run', () => {
  const sut = pathToFileURL(BIN).href;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(sut)})`], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
