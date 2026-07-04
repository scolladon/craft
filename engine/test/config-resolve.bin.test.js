/**
 * Spawn-smoke coverage for the config-resolve bin: proves the shim is wired to
 * config-resolve-main.js end-to-end against a REAL scratch $HOME and scratch
 * repo (never the developer's/CI's actual $HOME). Branch coverage lives in
 * config-resolve-main.test.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'config-resolve.js');

function runBin(name, { cwd, home }) {
  return spawnSync(process.execPath, [BIN, name], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

test('Given a local craft-x.md in the scratch repo, when the bin is spawned, then it exits 0 and stdout is the absolute local path', () => {
  const home = mkdtempSync(join(tmpdir(), 'config-resolve-home-'));
  const repo = mkdtempSync(join(tmpdir(), 'config-resolve-repo-'));
  try {
    mkdirSync(join(repo, '.claude'), { recursive: true });
    const localPath = join(repo, '.claude', 'craft-x.md');
    writeFileSync(localPath, '# x\n');

    const result = runBin('x', { cwd: repo, home });

    // the OS-reported cwd resolves ancestor symlinks (e.g. macOS /var → /private/var),
    // so the bin's absolute stdout is compared against the realpath, not the raw mkdtemp path
    const realLocalPath = join(realpathSync(repo), '.claude', 'craft-x.md');
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout.trim(), realLocalPath);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test('Given neither scope has the config, when the bin is spawned, then it exits non-zero and stderr names both scopes', () => {
  const home = mkdtempSync(join(tmpdir(), 'config-resolve-home-'));
  const repo = mkdtempSync(join(tmpdir(), 'config-resolve-repo-'));
  try {
    const result = runBin('missing', { cwd: repo, home });

    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('./.claude/craft-missing.md'), `stderr: ${result.stderr}`);
    assert.ok(result.stderr.includes('~/.claude/craft-missing.md'), `stderr: ${result.stderr}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});
