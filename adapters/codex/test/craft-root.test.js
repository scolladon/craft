import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { resolveCraftRoot } from '../src/craft-root.js';

function repoRootFromHere() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

describe('resolveCraftRoot() — real on-disk placement', () => {
  it('Given a codex adapter src module URL, when resolveCraftRoot runs, then it returns a root containing engine/bin', () => {
    const sut = resolveCraftRoot;
    const expectedRoot = repoRootFromHere();

    const result = sut(import.meta.url);

    assert.equal(result, expectedRoot);
    assert.ok(existsSync(join(result, 'engine', 'bin')));
  });
});

describe('resolveCraftRoot() — failure contract', () => {
  it('Given a moduleUrl that is not a file:// URL, when resolveCraftRoot runs, then it throws naming the unresolvable moduleUrl', () => {
    const sut = resolveCraftRoot;

    assert.throws(() => sut('https://example.test/x.js'), /https:\/\/example\.test\/x\.js/);
  });

  it('Given an injected fsOps whose existsSync reports the computed root absent, when resolveCraftRoot runs, then it throws naming the computed root', () => {
    const sut = resolveCraftRoot;
    const fsOps = { existsSync: () => false, realpathSync: (path) => path };

    assert.throws(() => sut(import.meta.url, fsOps), /does not exist/);
  });

  it('Given an injected fsOps where the root exists but engine/bin does not, when resolveCraftRoot runs, then it throws naming the wrong up-walk depth', () => {
    const sut = resolveCraftRoot;
    const expectedRoot = repoRootFromHere();
    const fsOps = {
      existsSync: (path) => path === expectedRoot,
      realpathSync: (path) => path,
    };

    assert.throws(() => sut(import.meta.url, fsOps), /does not contain engine\/bin/);
  });
});

describe('resolveCraftRoot() — up-walk depth pin', () => {
  it('Given the up-walk depth, when a real adapters/codex/src module resolves, then the result is the repo root and NOT one level off', () => {
    const sut = resolveCraftRoot;

    const result = sut(import.meta.url);

    assert.ok(existsSync(join(result, 'engine', 'bin')));
    assert.ok(existsSync(join(result, 'adapters', 'codex')));
  });
});
