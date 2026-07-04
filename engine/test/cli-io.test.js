/**
 * Direct unit tests for the shared cli-io helpers extracted from the
 * config-resolve/init-land/promote-plan mains: isRegularFile, fail, and the
 * exit-code constants. Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isRegularFile, fail, EXIT_OK, EXIT_ERR } from '../src/cli-io.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'craft-cli-io-'));
  try {
    return fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ─── isRegularFile ────────────────────────────────────────────────────────────

test('Given an existing regular file, when isRegularFile runs, then it returns true', () => {
  const sut = isRegularFile;

  withTmp((tmp) => {
    const filePath = join(tmp, 'file.txt');
    writeFileSync(filePath, '');

    assert.equal(sut(filePath), true);
  });
});

test('Given a directory, when isRegularFile runs, then it returns false', () => {
  const sut = isRegularFile;

  withTmp((tmp) => {
    const dirPath = join(tmp, 'sub');
    mkdirSync(dirPath);

    assert.equal(sut(dirPath), false);
  });
});

test('Given a missing path, when isRegularFile runs, then it returns false', () => {
  const sut = isRegularFile;

  withTmp((tmp) => {
    const missingPath = join(tmp, 'nope.txt');

    assert.equal(sut(missingPath), false);
  });
});

test('Given a symlink to a regular file, when isRegularFile runs, then it returns true', () => {
  const sut = isRegularFile;

  withTmp((tmp) => {
    const filePath = join(tmp, 'file.txt');
    writeFileSync(filePath, '');
    const linkPath = join(tmp, 'link.txt');
    symlinkSync(filePath, linkPath);

    assert.equal(sut(linkPath), true);
  });
});

// ─── fail ──────────────────────────────────────────────────────────────────

test('Given an io double, when fail runs, then it writes the message to stderr and returns EXIT_ERR', () => {
  const sut = fail;
  const io = makeCaptureIo();

  const result = sut(io, 'boom\n');

  assert.equal(result, EXIT_ERR);
  assert.equal(io.stderr.joined(), 'boom\n');
  assert.equal(io.stdout.joined(), '');
});

// ─── constants ────────────────────────────────────────────────────────────────

test('Given the exit-code constants, when read, then EXIT_OK is 0 and EXIT_ERR is 1', () => {
  assert.equal(EXIT_OK, 0);
  assert.equal(EXIT_ERR, 1);
});
