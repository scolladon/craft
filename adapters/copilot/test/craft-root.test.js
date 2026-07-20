import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { resolveCraftRoot } from '../src/craft-root.js';

function repoRootFromHere() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

describe('resolveCraftRoot() — real on-disk placement', () => {
  it("Given the adapter's own module url, when resolveCraftRoot runs, then it returns the repo root that contains engine/bin", () => {
    const sut = resolveCraftRoot;
    const expectedRoot = repoRootFromHere();

    const result = sut(import.meta.url);

    assert.equal(result, expectedRoot);
    assert.ok(existsSync(join(result, 'engine', 'bin')));
  });
});

describe('resolveCraftRoot() — failure contract', () => {
  it('Given a moduleUrl whose computed root does not exist, when resolveCraftRoot runs, then it throws naming the computed root', () => {
    const sut = resolveCraftRoot;
    const fsOps = { existsSync: () => false, realpathSync: (path) => path };

    assert.throws(() => sut(import.meta.url, fsOps), /does not exist/);
  });

  it('Given a computed root without engine/bin, when resolveCraftRoot runs, then it throws naming the wrong up-walk depth', () => {
    const sut = resolveCraftRoot;
    const expectedRoot = repoRootFromHere();
    const fsOps = {
      existsSync: (path) => path === expectedRoot,
      realpathSync: (path) => path,
    };

    assert.throws(() => sut(import.meta.url, fsOps), /does not contain engine\/bin/);
  });

  it('Given a non-file:// moduleUrl, when resolveCraftRoot runs, then it throws rather than surfacing a URL error', () => {
    const sut = resolveCraftRoot;

    assert.throws(() => sut('https://example.test/x.js'), /did not resolve to an absolute path/);
  });
});

describe('resolveCraftRoot() — up-walk depth pin', () => {
  it('Given the real on-disk placement of the resolver, when the up-level count is applied to a hooks-directory sibling, then it lands on the same repo root', () => {
    const sut = resolveCraftRoot;
    const repoRoot = repoRootFromHere();
    const hooksModuleUrl = pathToFileURL(
      join(repoRoot, 'adapters', 'copilot', 'hooks', 'craft-observer.js'),
    ).href;
    const expected = sut(import.meta.url);

    const result = sut(hooksModuleUrl);

    assert.equal(result, expected);
  });
});
