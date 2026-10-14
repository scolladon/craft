/**
 * The trust-hook bin, spawned as a real process, runs its main when reached through a symlinked
 * adapter dir and stays inert when imported as a module. The environment is built from scratch:
 * no codex on PATH and throwaway HOME / CODEX_HOME, so even a guard that wrongly runs main ends in
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

// A fresh throwaway per call: bin/ holds only node, codex-link points at the real adapter dir.
function withSandbox(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'craft-trust-hook-'));
  try {
    mkdirSync(join(tmp, 'bin'));
    symlinkSync(process.execPath, join(tmp, 'bin', 'node'));
    symlinkSync(ADAPTER_DIR, join(tmp, LINK_NAME));
    const env = Object.freeze({ PATH: join(tmp, 'bin'), HOME: tmp, CODEX_HOME: join(tmp, 'codex-home') });
    return fn({ tmp, env });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function spawnNode(argv, { tmp, env }) {
  return spawnSync(process.execPath, argv, { cwd: tmp, env, input: '', encoding: 'utf8' });
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
});
