/**
 * Direct unit tests for the shared cli-io helpers extracted from the
 * config-resolve/init-land/promote-plan mains: isRegularFile, isDirectoryPath,
 * isNonEmptyString, fail, isEntryPoint, and the exit-code constants. Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { isRegularFile, isDirectoryPath, isNonEmptyString, fail, isEntryPoint, EXIT_OK, EXIT_ERR } from '../src/cli-io.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';
import { withTempCwd } from '../test-helpers/with-cwd.js';

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

// ─── isDirectoryPath ──────────────────────────────────────────────────────────

test('Given a directory, when isDirectoryPath runs, then it returns true', () => {
  const sut = isDirectoryPath;

  withTmp((tmp) => {
    const dir = join(tmp, 'd');
    mkdirSync(dir);

    assert.equal(sut(dir), true);
  });
});

test('Given a regular file, when isDirectoryPath runs, then it returns false', () => {
  const sut = isDirectoryPath;

  withTmp((tmp) => {
    const filePath = join(tmp, 'file.txt');
    writeFileSync(filePath, '');

    assert.equal(sut(filePath), false);
  });
});

test('Given a missing path, when isDirectoryPath runs, then it returns false', () => {
  const sut = isDirectoryPath;

  withTmp((tmp) => {
    assert.equal(sut(join(tmp, 'missing')), false);
  });
});

// ─── isNonEmptyString ─────────────────────────────────────────────────────────

test('Given a non-blank string, when isNonEmptyString runs, then it returns true', () => {
  const sut = isNonEmptyString;

  const result = sut('x');

  assert.equal(result, true);
});

test('Given a whitespace-only or empty string, when isNonEmptyString runs, then it returns false', () => {
  const sut = isNonEmptyString;

  const results = [sut('  '), sut('')];

  assert.deepEqual(results, [false, false]);
});

test('Given a non-string value, when isNonEmptyString runs, then it returns false', () => {
  const sut = isNonEmptyString;

  const results = [sut(1), sut(undefined)];

  assert.deepEqual(results, [false, false]);
});

// ─── isEntryPoint ─────────────────────────────────────────────────────────────

// real/m.js plus link -> real, so one tree offers a physical and a symlinked route to the same module.
function withEntryFixture(fn) {
  return withTmp((tmp) => {
    mkdirSync(join(tmp, 'real'));
    writeFileSync(join(tmp, 'real', 'm.js'), '');
    symlinkSync(join(tmp, 'real'), join(tmp, 'link'));
    return fn(tmp);
  });
}

function metaOf(path) {
  return { url: pathToFileURL(path).href };
}

function argvNaming(argv1) {
  return [process.execPath, argv1];
}

test('Given argv1 naming the module by its own path, when isEntryPoint runs, then it returns true', () => {
  const sut = isEntryPoint;

  withEntryFixture((tmp) => {
    const result = sut(metaOf(join(tmp, 'real', 'm.js')), argvNaming(join(tmp, 'real', 'm.js')));

    assert.equal(result, true);
  });
});

test('Given argv1 reaching the module through a symlinked directory, when isEntryPoint runs, then it returns true', () => {
  const sut = isEntryPoint;

  withEntryFixture((tmp) => {
    const result = sut(metaOf(join(tmp, 'real', 'm.js')), argvNaming(join(tmp, 'link', 'm.js')));

    assert.equal(result, true);
  });
});

test('Given a module URL kept symlinked as under --preserve-symlinks-main, when isEntryPoint runs, then it returns true', () => {
  const sut = isEntryPoint;

  withEntryFixture((tmp) => {
    const result = sut(metaOf(join(tmp, 'link', 'm.js')), argvNaming(join(tmp, 'link', 'm.js')));

    assert.equal(result, true);
  });
});

test('Given argv1 a symlink to the module file itself, when isEntryPoint runs, then it returns true', () => {
  const sut = isEntryPoint;

  withEntryFixture((tmp) => {
    symlinkSync(join(tmp, 'real', 'm.js'), join(tmp, 'alias.js'));

    const result = sut(metaOf(join(tmp, 'real', 'm.js')), argvNaming(join(tmp, 'alias.js')));

    assert.equal(result, true);
  });
});

test('Given argv1 naming a different existing file, when isEntryPoint runs, then it returns false', () => {
  const sut = isEntryPoint;

  withEntryFixture((tmp) => {
    writeFileSync(join(tmp, 'real', 'other.js'), '');

    const result = sut(metaOf(join(tmp, 'real', 'm.js')), argvNaming(join(tmp, 'real', 'other.js')));

    assert.equal(result, false);
  });
});

test('Given argv1 naming a path that does not exist, when isEntryPoint runs, then it returns false', () => {
  const sut = isEntryPoint;

  withEntryFixture((tmp) => {
    const result = sut(metaOf(join(tmp, 'real', 'm.js')), argvNaming(join(tmp, 'real', 'missing.js')));

    assert.equal(result, false);
  });
});

test('Given argv1 crossing a regular file as if it were a directory, when isEntryPoint runs, then it rethrows the ENOTDIR error', () => {
  const sut = isEntryPoint;

  withEntryFixture((tmp) => {
    const modulePath = join(tmp, 'real', 'm.js');

    assert.throws(() => sut(metaOf(modulePath), argvNaming(join(modulePath, 'x'))), { code: 'ENOTDIR' });
  });
});

test('Given argv1 undefined and a file named undefined in cwd, when isEntryPoint runs, then it returns false', async () => {
  const sut = isEntryPoint;
  const seedUndefinedFile = (dir) => writeFileSync(join(dir, 'undefined'), '');

  const result = await withTempCwd(seedUndefinedFile, () => sut(metaOf(join(process.cwd(), 'undefined')), [process.execPath]));

  assert.equal(result, false);
});

test('Given argv1 empty or not a string, when isEntryPoint runs, then it returns false without throwing', () => {
  const sut = isEntryPoint;

  withEntryFixture((tmp) => {
    const meta = metaOf(join(tmp, 'real', 'm.js'));

    const results = [sut(meta, argvNaming('')), sut(meta, argvNaming(42))];

    assert.deepEqual(results, [false, false]);
  });
});

// ─── constants ────────────────────────────────────────────────────────────────

test('Given the exit-code constants, when read, then EXIT_OK is 0 and EXIT_ERR is 1', () => {
  assert.equal(EXIT_OK, 0);
  assert.equal(EXIT_ERR, 1);
});
