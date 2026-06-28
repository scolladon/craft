import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

import { containByRealpath, realExistingPrefix } from '../src/contain.js';

function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'craft-contain-'));
  try {
    return fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ─── containByRealpath — in-root non-symlink ──────────────────────────────────

test('Given an existing in-root non-symlink file, when containByRealpath is called, then it returns the resolved path unchanged', () => {
  const sut = containByRealpath;

  withTmp(tmp => {
    writeFileSync(join(tmp, 'file.txt'), '');
    const target = join(tmp, 'file.txt');

    const result = sut(tmp, target);

    assert.equal(result, target);
  });
});

// ─── containByRealpath — symlink dir escape via realpath ──────────────────────

test('Given a symlink directory inside root pointing outside, when containByRealpath is called via that path, then it returns null', () => {
  const sut = containByRealpath;

  const outside = mkdtempSync(join(tmpdir(), 'craft-outside-'));
  try {
    withTmp(tmp => {
      symlinkSync(outside, join(tmp, 'link'));
      const target = join(tmp, 'link', 'secret.txt');

      const result = sut(tmp, target);

      assert.equal(result, null);
    });
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

// ─── containByRealpath — not-yet-created leaf ─────────────────────────────────

test('Given a not-yet-created leaf under an existing in-root directory, when containByRealpath is called, then it returns the path (accepted)', () => {
  const sut = containByRealpath;

  withTmp(tmp => {
    mkdirSync(join(tmp, '.claude'));
    const target = join(tmp, '.claude', 'craft-memory.md');

    const result = sut(tmp, target);

    assert.equal(result, target);
  });
});

// ─── containByRealpath — dangling symlink leaf ────────────────────────────────

test('Given a dangling symlink leaf inside root whose target is absent, when containByRealpath is called, then it returns null', () => {
  const sut = containByRealpath;

  withTmp(tmp => {
    symlinkSync(join(tmp, 'nonexistent'), join(tmp, 'dangling'));

    const result = sut(tmp, join(tmp, 'dangling'));

    assert.equal(result, null);
  });
});

// ─── containByRealpath — root itself ─────────────────────────────────────────

test('Given the root path itself as target, when containByRealpath is called, then it returns the root', () => {
  const sut = containByRealpath;

  withTmp(tmp => {
    const result = sut(tmp, tmp);

    assert.equal(result, tmp);
  });
});

// ─── containByRealpath — non-ENOENT fs failure (ENOTDIR) ─────────────────────

test('Given a path where an ancestor component is a regular file (ENOTDIR), when containByRealpath is called, then it returns null (fail-closed)', () => {
  const sut = containByRealpath;

  withTmp(tmp => {
    writeFileSync(join(tmp, 'notadir'), 'content');
    const target = join(tmp, 'notadir', 'child');

    const result = sut(tmp, target);

    assert.equal(result, null);
  });
});

// ─── realExistingPrefix — deepest existing ancestor ───────────────────────────

test('Given a multi-segment missing tail, when realExistingPrefix is called, then it resolves the deepest existing ancestor and appends the lexical tail', () => {
  const sut = realExistingPrefix;

  withTmp(tmp => {
    mkdirSync(join(tmp, 'existing'));
    const missing = join(tmp, 'existing', 'a', 'b', 'c.txt');

    const result = sut(missing);

    const expectedTail = sep + join('a', 'b', 'c.txt');
    assert.ok(
      result.endsWith(expectedTail),
      `expected result to end with "${expectedTail}", got "${result}"`,
    );
  });
});

// ─── realExistingPrefix — non-ENOENT error propagates ─────────────────────────

test('Given a path whose deepest existing ancestor is a regular file (ENOTDIR from realpathSync), when realExistingPrefix is called, then it throws the non-ENOENT error', () => {
  const sut = realExistingPrefix;

  withTmp(tmp => {
    writeFileSync(join(tmp, 'notadir'), 'content');
    const path = join(tmp, 'notadir', 'child');

    assert.throws(() => sut(path), { code: 'ENOTDIR' });
  });
});

// ─── containByRealpath — lexical escape via external symlink pointing inside ──

test('Given a target that is lexically outside the root but whose ancestor is an external symlink resolving inside the root, when containByRealpath is called, then it returns null (lexical guard)', () => {
  const sut = containByRealpath;

  const outside = mkdtempSync(join(tmpdir(), 'craft-outside-'));
  try {
    withTmp(root => {
      writeFileSync(join(root, 'file.txt'), '');
      symlinkSync(root, join(outside, 'link-to-root'));
      const target = join(outside, 'link-to-root', 'file.txt');

      const result = sut(root, target);

      assert.equal(result, null);
    });
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
