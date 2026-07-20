import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCraftRoot } from '../src/craft-root.js';

// A module URL shaped like the real caller: adapters/pi/extensions/craft-guard/index.ts.
// Four dirs up from craft-guard's own dir lands on the repo root.
const FAKE_MODULE_URL = 'file:///fake/repo/adapters/pi/extensions/craft-guard/index.ts';
const FAKE_ROOT = '/fake/repo';
const FAKE_ENGINE_BIN = join(FAKE_ROOT, 'engine', 'bin');

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeFsOps({ exists = new Set(), realpath } = {}) {
  return {
    existsSync: (path) => exists.has(path),
    realpathSync: realpath ?? ((path) => path),
  };
}

describe('resolveCraftRoot() — four-up self-location', () => {
  it('Given a module URL whose computed root exists and contains engine/bin, when resolved, then returns the realpath\'d root', () => {
    const sut = resolveCraftRoot;
    const fsOps = makeFsOps({ exists: new Set([FAKE_ROOT, FAKE_ENGINE_BIN]) });

    const result = sut(FAKE_MODULE_URL, fsOps);

    assert.equal(result, FAKE_ROOT);
  });
});

describe('resolveCraftRoot() — failure contract', () => {
  it('Given a computed root that does not exist, when resolved, then throws naming the offending root', () => {
    const sut = resolveCraftRoot;
    const fsOps = makeFsOps({ exists: new Set() });

    assert.throws(() => sut(FAKE_MODULE_URL, fsOps), new RegExp(escapeForRegExp(FAKE_ROOT)));
  });

  it('Given a computed root that exists but lacks engine/bin, when resolved, then throws naming the offending root (wrong up-walk depth)', () => {
    const sut = resolveCraftRoot;
    const fsOps = makeFsOps({ exists: new Set([FAKE_ROOT]) });

    assert.throws(() => sut(FAKE_MODULE_URL, fsOps), new RegExp(escapeForRegExp(FAKE_ROOT)));
  });

  it('Given a module URL that does not resolve to an absolute path, when resolved, then throws naming the offending value', () => {
    const sut = resolveCraftRoot;
    const fsOps = makeFsOps();

    assert.throws(() => sut('', fsOps), /did not resolve to an absolute path/);
  });
});

describe('resolveCraftRoot() — symlink realpath', () => {
  it('Given a symlinked root, when resolved, then returns the realpath target, not the symlink path', () => {
    const sut = resolveCraftRoot;
    const REALPATH_TARGET = '/real/repo';
    const fsOps = makeFsOps({
      exists: new Set([FAKE_ROOT, FAKE_ENGINE_BIN]),
      realpath: () => REALPATH_TARGET,
    });

    const result = sut(FAKE_MODULE_URL, fsOps);

    assert.equal(result, REALPATH_TARGET);
  });
});

describe('CRAFT_ROOT bash-layer default-expansion shim', () => {
  const SHIM = '${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}';
  const THROWAWAY_CWD = tmpdir();

  function expandShim(env) {
    return execFileSync('bash', ['-c', `echo ${SHIM}`], {
      encoding: 'utf8',
      cwd: THROWAWAY_CWD,
      env,
    }).trim();
  }

  it('Given CRAFT_ROOT unset, when the shim expands, then it falls back to CLAUDE_PLUGIN_ROOT', () => {
    const sut = expandShim;

    const result = sut({ PATH: process.env.PATH, CLAUDE_PLUGIN_ROOT: '/x' });

    assert.equal(result, '/x');
  });

  it('Given both CRAFT_ROOT and CLAUDE_PLUGIN_ROOT set, when the shim expands, then CRAFT_ROOT wins', () => {
    const sut = expandShim;

    const result = sut({ PATH: process.env.PATH, CRAFT_ROOT: '/y', CLAUDE_PLUGIN_ROOT: '/x' });

    assert.equal(result, '/y');
  });
});
