import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '..', 'bin', 'driver-state.js');
const WRAPPER = join(HERE, '..', '..', 'scripts', 'driver-state.sh');
const ENV_VAR = 'CRAFT_DRIVER_STATE';

function envWith(value) {
  const { [ENV_VAR]: _drop, ...rest } = process.env;
  return value === undefined ? rest : { ...rest, [ENV_VAR]: value };
}

test('Given the variable unset, when the bin runs active, then it exits 1', () => {
  const result = spawnSync(process.execPath, [BIN, 'active'], { encoding: 'utf8', env: envWith(undefined) });

  assert.equal(result.status, 1);
});

test('Given a state dir, when the bin runs blocked, then status holds the line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'driver-state-bin-'));
  try {
    const result = spawnSync(process.execPath, [BIN, 'blocked', 'resolve', 'manifest', 'invalid'], { encoding: 'utf8', env: envWith(dir) });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'BLOCKED resolve: manifest invalid\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given a state dir, when the wrapper runs active, then it prints the dir and exits 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'driver-state-sh-'));
  try {
    const result = spawnSync('bash', [WRAPPER, 'active'], { encoding: 'utf8', env: envWith(dir) });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${dir}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given no args, when the wrapper runs finished, then the exit code 2 passes through', () => {
  const dir = mkdtempSync(join(tmpdir(), 'driver-state-sh-'));
  try {
    const result = spawnSync('bash', [WRAPPER, 'finished'], { encoding: 'utf8', env: envWith(dir) });

    assert.equal(result.status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given a reason on stdin, when the bin runs blocked with -, then status holds the stdin text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'driver-state-bin-'));
  try {
    const result = spawnSync(process.execPath, [BIN, 'blocked', 'resolve', '-'], { encoding: 'utf8', env: envWith(dir), input: 'piped reason\n' });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(dir, 'status'), 'utf8'), 'BLOCKED resolve: piped reason\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
