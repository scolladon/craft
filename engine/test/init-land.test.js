/**
 * Unit tests for the land core.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { land } from '../src/init-land.js';

function passingLint(recorder) {
  return (tmpPath) => {
    if (recorder) recorder.path = tmpPath;
    return { exitCode: 0, errors: [] };
  };
}

function failingLint(errors) {
  return () => ({ exitCode: 2, errors: errors ?? ['lint: manifest invalid'] });
}

function renameSpy() {
  const calls = [];
  const rename = (from, to) => { calls.push({ from, to }); };
  return { rename, calls };
}

test('Given lint passes, when land runs, then rename is called once and result is ok with finalPath', () => {
  const spy = renameSpy();
  const sut = land;

  const result = sut(
    { tmpPath: '/tmp/craft.tmp', finalPath: '/tmp/craft.final' },
    { lint: passingLint(), rename: spy.rename }
  );

  assert.equal(result.ok, true);
  assert.equal(result.path, '/tmp/craft.final');
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0].from, '/tmp/craft.tmp');
  assert.equal(spy.calls[0].to, '/tmp/craft.final');
});

test('Given lint fails with non-zero exit, when land runs, then rename is not called and result is not ok', () => {
  const spy = renameSpy();
  const sut = land;

  const result = sut(
    { tmpPath: '/tmp/craft.tmp', finalPath: '/tmp/craft.final' },
    { lint: failingLint(['manifest error']), rename: spy.rename }
  );

  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors), 'result.errors must be an array');
  assert.equal(spy.calls.length, 0, 'rename must not be called on lint failure');
});

test('Given rename throws, when land runs, then result is not ok with the error message and error is not swallowed', () => {
  const throwingRename = () => { throw new Error('EACCES: permission denied, rename'); };
  const sut = land;

  const result = sut(
    { tmpPath: '/tmp/craft.tmp', finalPath: '/tmp/craft.final' },
    { lint: passingLint(), rename: throwingRename }
  );

  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.errors), 'result.errors must be an array');
  assert.ok(
    result.errors.some((e) => e.includes('EACCES')),
    `error message must surface the cause; errors was: ${JSON.stringify(result.errors)}`
  );
});

test('Given a tmpPath, when land runs, then deps.lint receives that exact tmpPath', () => {
  const recorder = { path: null };
  const spy = renameSpy();
  const sut = land;

  sut(
    { tmpPath: '/tmp/craft-specific.tmp', finalPath: '/tmp/craft.final' },
    { lint: passingLint(recorder), rename: spy.rename }
  );

  assert.equal(recorder.path, '/tmp/craft-specific.tmp');
});

test('Given lint fails, when land runs with real paths, then the final path is never written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'init-land-'));
  try {
    const tmpPath = join(dir, 'manifest.tmp');
    const finalPath = join(dir, 'manifest.final');
    writeFileSync(tmpPath, '# test');
    const sut = land;

    sut(
      { tmpPath, finalPath },
      { lint: failingLint(['fail']), rename: renameSync }
    );

    assert.equal(
      existsSync(finalPath),
      false,
      'finalPath must not exist after lint failure'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
