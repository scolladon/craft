/**
 * The adr-lint bin, reached through a symlinked engine dir that is repointed or removed while its
 * main module loads, still runs its main instead of exiting 0 in silence. A preload swaps the link
 * at that moment. The environment is built from scratch: only node on PATH, throwaway HOME and
 * CODEX_HOME, and the link inside the test's own temp dir. Given/When/Then titles,
 * Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SWAP_PRELOAD = join(ENGINE_DIR, 'test-helpers', 'swap-link-on-load.js');
const LINK_NAME = 'engine-link';
const ELSEWHERE_NAME = 'elsewhere';
const BIN_NAME = 'adr-lint.js';
const LOUD_ARGV = ['/nonexistent'];
const SWAP_TRIGGER = '/engine/src/adr-lint-main.js';
const EXIT_USAGE = 2;

// bin/ holds only node; elsewhere/bin/adr-lint.js is an empty decoy, so a repointed link names a real, different file.
function sealedSandbox(tmp, mode) {
  mkdirSync(join(tmp, 'bin'));
  symlinkSync(process.execPath, join(tmp, 'bin', 'node'));
  mkdirSync(join(tmp, ELSEWHERE_NAME, 'bin'), { recursive: true });
  writeFileSync(join(tmp, ELSEWHERE_NAME, 'bin', BIN_NAME), '');
  symlinkSync(ENGINE_DIR, join(tmp, LINK_NAME));
  return Object.freeze({
    PATH: join(tmp, 'bin'),
    HOME: tmp,
    CODEX_HOME: join(tmp, 'codex-home'),
    CRAFT_SWAP_LINK: join(tmp, LINK_NAME),
    CRAFT_SWAP_ON: SWAP_TRIGGER,
    CRAFT_SWAP_MODE: mode,
    CRAFT_SWAP_TO: join(tmp, ELSEWHERE_NAME),
  });
}

function spawnThroughSwappedLink(mode) {
  const tmp = mkdtempSync(join(tmpdir(), 'craft-bin-swap-'));
  try {
    const env = sealedSandbox(tmp, mode);
    const binPath = join(tmp, LINK_NAME, 'bin', BIN_NAME);
    return spawnSync(process.execPath, ['--import', SWAP_PRELOAD, binPath, ...LOUD_ARGV], {
      cwd: tmp,
      env,
      input: '',
      encoding: 'utf8',
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('Given adr-lint reached through a symlinked engine dir repointed while its main module loads, when spawned with a nonexistent ADR dir, then it exits 2', () => {
  // Arrange / Act
  const sut = spawnThroughSwappedLink('repoint');

  // Assert
  assert.equal(sut.error, undefined);
  assert.equal(sut.status, EXIT_USAGE, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
});

test('Given adr-lint reached through a symlinked engine dir removed while its main module loads, when spawned with a nonexistent ADR dir, then it exits 2', () => {
  // Arrange / Act
  const sut = spawnThroughSwappedLink('unlink');

  // Assert
  assert.equal(sut.error, undefined);
  assert.equal(sut.status, EXIT_USAGE, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
});
