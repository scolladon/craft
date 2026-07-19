import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCraftRoot } from '../src/craft-root.js';

const stubFsOps = ({ exists = true, realpath } = {}) => ({
  existsSync: () => exists,
  realpathSync: (path) => realpath ?? path,
});

describe('resolveCraftRoot() — worktree/directory selection', () => {
  it('Given a context with worktree and directory both set, when resolved, then worktree wins', () => {
    const sut = resolveCraftRoot;
    const fsOps = stubFsOps();

    const result = sut({ worktree: '/repo', directory: '/other' }, fsOps);

    assert.equal(result, '/repo');
  });

  it('Given a context with only directory set, when resolved, then directory is used', () => {
    const sut = resolveCraftRoot;
    const fsOps = stubFsOps();

    const result = sut({ directory: '/repo' }, fsOps);

    assert.equal(result, '/repo');
  });
});

describe('resolveCraftRoot() — failure contract', () => {
  it('Given a relative path, when resolved, then throws naming the offending value', () => {
    const sut = resolveCraftRoot;
    const fsOps = stubFsOps();

    assert.throws(() => sut({ worktree: 'relative/path' }, fsOps), /relative\/path/);
  });

  it('Given an empty path, when resolved, then throws', () => {
    const sut = resolveCraftRoot;
    const fsOps = stubFsOps();

    assert.throws(() => sut({ worktree: '' }, fsOps), Error);
  });

  it('Given no worktree and no directory, when resolved, then throws', () => {
    const sut = resolveCraftRoot;
    const fsOps = stubFsOps();

    assert.throws(() => sut({}, fsOps), Error);
  });

  it('Given a path that does not exist on disk, when resolved, then throws naming the offending value', () => {
    const sut = resolveCraftRoot;
    const fsOps = stubFsOps({ exists: false });

    assert.throws(() => sut({ worktree: '/missing' }, fsOps), /\/missing/);
  });
});

describe('resolveCraftRoot() — realpath containment', () => {
  it('Given a worktree path that is a symlink, when resolved, then the realpath is returned', () => {
    const sut = resolveCraftRoot;
    const fsOps = stubFsOps({ realpath: '/real/repo' });

    const result = sut({ worktree: '/repo' }, fsOps);

    assert.equal(result, '/real/repo');
  });
});
