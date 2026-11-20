import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REGISTER_HEADER } from '../src/rulings.js';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'rulings-lint.js');
const REGISTER = 'RULINGS.md';

function runWithRegister(lines) {
  const root = mkdtempSync(join(tmpdir(), 'rulingslint-bin-'));
  try {
    writeFileSync(join(root, REGISTER), `${REGISTER_HEADER}${lines.join('\n')}\n`);
    return spawnSync(process.execPath, [BIN, REGISTER], { encoding: 'utf8', cwd: root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('Given a valid register, when the rulings-lint bin is spawned, then it exits 0', () => {
  const sut = runWithRegister;

  const result = sut(['- R-001 [a/**] First.']);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(result.stdout.includes('rulings-lint: 1 rulings'));
});

test('Given an invalid register, when the rulings-lint bin is spawned, then it exits 2', () => {
  const sut = runWithRegister;

  const result = sut(['- R-002 [] Second.', '- R-001 [] First.']);

  assert.equal(result.status, 2);
  assert.ok(result.stdout.includes(`${REGISTER}:8: R-001 out of order`));
});

test('Given the bin imported as a module, when loaded, then main does not run', () => {
  const sut = pathToFileURL(BIN).href;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(sut)})`], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
