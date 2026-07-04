/**
 * Spawn-smoke coverage for the promote-plan bin: proves the shim is wired to
 * promote-plan-main.js end-to-end against a REAL scratch $HOME and scratch
 * repo (never the developer's/CI's actual $HOME). Branch coverage lives in
 * promote-plan-main.test.js and promote-plan.test.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'promote-plan.js');

function runBin(args, { cwd, home }) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

test('Given a local craft-x.md in the scratch repo and no user destination, when the bin is spawned, then it exits 0 and stdout has source/dest/scope=user', () => {
  const home = mkdtempSync(join(tmpdir(), 'promote-plan-home-'));
  const cwd = mkdtempSync(join(tmpdir(), 'promote-plan-cwd-'));
  try {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    writeFileSync(join(cwd, '.claude', 'craft-x.md'), '# x\n');

    const result = runBin(['x'], { cwd, home });

    // the OS-reported cwd resolves ancestor symlinks (e.g. macOS /var → /private/var),
    // but $HOME is read verbatim from the env — only the source side is realpath-compared
    const realLocalPath = join(realpathSync(cwd), '.claude', 'craft-x.md');
    const userPath = join(home, '.claude', 'craft-x.md');
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.stdout, `source=${realLocalPath}\ndest=${userPath}\nscope=user\n`);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('Given no local craft-x.md in the scratch repo, when the bin is spawned, then it exits non-zero and stderr names the missing local scope', () => {
  const home = mkdtempSync(join(tmpdir(), 'promote-plan-home-'));
  const cwd = mkdtempSync(join(tmpdir(), 'promote-plan-cwd-'));
  try {
    const result = runBin(['x'], { cwd, home });

    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes('no local-scope config x to promote'), `stderr: ${result.stderr}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});
