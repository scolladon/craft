/**
 * The trust-hook bin, spawned as a real process, runs its main when reached through a symlinked
 * adapter dir, even one repointed or removed while it starts, and stays inert when imported as a
 * module. The environment is built from scratch: no codex on PATH and throwaway HOME / CODEX_HOME, so even a guard that wrongly runs main ends in
 * a spawn ENOENT and never touches a real config. Given/When/Then titles, Arrange-Act-Assert bodies,
 * sut variable.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ADAPTER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ADAPTER_DIR, 'bin', 'trust-hook.js');
const LINK_NAME = 'codex-link';
const LOUD_ARGV = ['--bogus'];
const EXIT_REFUSED = 2;
const EXPECTED_STDERR = 'trust-hook: unrecognised argument(s): --bogus\n';
const IMPORTER_NAME = 'importer.mjs';
const SWAP_PRELOAD = join(ADAPTER_DIR, '..', '..', 'engine', 'test-helpers', 'swap-link-on-load.js');
const ELSEWHERE_NAME = 'elsewhere';
const CHECK_ARGV = ['--check'];
const SWAP_TRIGGER = '/adapters/codex/src/trust-hook-main.js';
const NEVER_LOADED_TRIGGER = '/never-loaded.js';
const EXPECTED_CHECK_STDERR = 'trust-hook: app-server process error: spawn codex ENOENT\n';

// A fresh throwaway per call: bin/ holds only node, codex-link points at the real adapter dir,
// and elsewhere/bin/trust-hook.js is an empty decoy a repointed link can name.
function withSandbox(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'craft-trust-hook-'));
  try {
    mkdirSync(join(tmp, 'bin'));
    symlinkSync(process.execPath, join(tmp, 'bin', 'node'));
    symlinkSync(ADAPTER_DIR, join(tmp, LINK_NAME));
    mkdirSync(join(tmp, ELSEWHERE_NAME, 'bin'), { recursive: true });
    writeFileSync(join(tmp, ELSEWHERE_NAME, 'bin', 'trust-hook.js'), '');
    const env = Object.freeze({ PATH: join(tmp, 'bin'), HOME: tmp, CODEX_HOME: join(tmp, 'codex-home') });
    return fn({ tmp, env });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function spawnNode(argv, { tmp, env }) {
  return spawnSync(process.execPath, argv, { cwd: tmp, env, input: '', encoding: 'utf8' });
}

// --check through the link, with the preload swapping the link when a module ending in trigger loads.
function spawnCheckWithSwap({ mode, trigger }, { tmp, env }) {
  const swapEnv = Object.freeze({
    ...env,
    CRAFT_SWAP_LINK: join(tmp, LINK_NAME),
    CRAFT_SWAP_ON: trigger,
    CRAFT_SWAP_MODE: mode,
    CRAFT_SWAP_TO: join(tmp, ELSEWHERE_NAME),
  });
  const argv = ['--import', SWAP_PRELOAD, join(tmp, LINK_NAME, 'bin', 'trust-hook.js'), ...CHECK_ARGV];
  return spawnNode(argv, { tmp, env: swapEnv });
}

describe('trust-hook bin — entry-point guard', () => {
  it('Given trust-hook reached through a symlinked adapter dir, when spawned with an unknown flag, then it refuses with exit 2', () => {
    // Arrange / Act
    const sut = withSandbox((sandbox) =>
      spawnNode([join(sandbox.tmp, LINK_NAME, 'bin', 'trust-hook.js'), ...LOUD_ARGV], sandbox),
    );

    // Assert
    assert.equal(sut.error, undefined);
    assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
    assert.equal(sut.stderr, EXPECTED_STDERR);
    assert.equal(sut.stdout, '');
  });

  it('Given trust-hook reached by its physical path, when spawned with an unknown flag, then it refuses with exit 2', () => {
    // Arrange / Act
    const sut = withSandbox((sandbox) => spawnNode([BIN, ...LOUD_ARGV], sandbox));

    // Assert
    assert.equal(sut.error, undefined);
    assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
    assert.equal(sut.stderr, EXPECTED_STDERR);
    assert.equal(sut.stdout, '');
  });

  it('Given trust-hook imported by another script, when the import settles, then main does not run', () => {
    // Arrange
    const importScript = `await import(${JSON.stringify(pathToFileURL(BIN).href)});\n`;

    // Act
    const sut = withSandbox((sandbox) => {
      const importerPath = join(sandbox.tmp, IMPORTER_NAME);
      writeFileSync(importerPath, importScript);
      return spawnNode([importerPath], sandbox);
    });

    // Assert
    assert.equal(sut.error, undefined);
    assert.equal(sut.status, 0, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
    assert.equal(sut.stdout, '');
    assert.equal(sut.stderr, '');
  });

  it('Given the swap preload with a trigger that never loads, when trust-hook is spawned with --check through the link, then it reports the codex spawn failure with exit 2', () => {
    // Arrange / Act
    const sut = withSandbox((sandbox) => spawnCheckWithSwap({ mode: 'unlink', trigger: NEVER_LOADED_TRIGGER }, sandbox));

    // Assert
    assert.equal(sut.error, undefined);
    assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
    assert.equal(sut.stderr, EXPECTED_CHECK_STDERR);
    assert.equal(sut.stdout, '');
  });

  it('Given the adapter-dir link repointed while trust-hook loads its main module, when spawned with --check, then it still runs main and exits 2, never 0', () => {
    // Arrange / Act
    const sut = withSandbox((sandbox) => spawnCheckWithSwap({ mode: 'repoint', trigger: SWAP_TRIGGER }, sandbox));

    // Assert
    assert.equal(sut.error, undefined);
    assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
    assert.equal(sut.stderr, EXPECTED_CHECK_STDERR);
    assert.equal(sut.stdout, '');
  });

  it('Given the adapter-dir link removed while trust-hook loads its main module, when spawned with --check, then it still runs main and exits 2, never 0', () => {
    // Arrange / Act
    const sut = withSandbox((sandbox) => spawnCheckWithSwap({ mode: 'unlink', trigger: SWAP_TRIGGER }, sandbox));

    // Assert
    assert.equal(sut.error, undefined);
    assert.equal(sut.status, EXIT_REFUSED, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
    assert.equal(sut.stderr, EXPECTED_CHECK_STDERR);
    assert.equal(sut.stdout, '');
  });
});
