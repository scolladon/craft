/**
 * Every engine/bin bin, reached through a symlink this suite makes itself, runs its main on
 * bad input instead of exiting 0 in silence. The link is test-made so the check holds on a
 * host whose temp dir is not itself a symlink. Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIR = join(ENGINE_DIR, 'bin');
const LINK_NAME = 'engine-link';
const DEFAULT_LOUD_ARGV = ['/nonexistent'];
// usage-mine accepts a nonexistent path silently (exit 0, reports written into cwd); an unknown source is its loud input.
const LOUD_ARGV_OVERRIDES = { 'usage-mine.js': ['--source', 'bogus'] };

function binFileNames() {
  return readdirSync(BIN_DIR)
    .filter((name) => name.endsWith('.js'))
    .sort();
}

function spawnThroughLink(binName, argv) {
  const tmp = mkdtempSync(join(tmpdir(), 'craft-bin-link-'));
  try {
    symlinkSync(ENGINE_DIR, join(tmp, LINK_NAME));
    const binPath = join(tmp, LINK_NAME, 'bin', binName);
    return spawnSync(process.execPath, [binPath, ...argv], {
      cwd: tmp,
      input: '',
      encoding: 'utf8',
      env: { ...process.env, HOME: tmp },
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('Given engine/bin, when its *.js files are enumerated, then the set is non-empty and includes adr-lint.js', () => {
  const sut = binFileNames();

  assert.ok(sut.includes('adr-lint.js'), `enumerated: ${sut.join(', ')}`);
});

test('Given the adr-lint bin reached through a symlinked engine dir, when spawned with a nonexistent ADR dir, then it exits 2', () => {
  const sut = spawnThroughLink('adr-lint.js', DEFAULT_LOUD_ARGV);

  assert.equal(sut.error, undefined);
  assert.equal(sut.status, 2, `stdout: ${sut.stdout} stderr: ${sut.stderr}`);
});

for (const binName of binFileNames()) {
  test(`Given the ${binName} bin reached through a symlinked engine dir, when spawned with bad input, then it exits non-zero or writes output`, () => {
    const argv = LOUD_ARGV_OVERRIDES[binName] ?? DEFAULT_LOUD_ARGV;

    const sut = spawnThroughLink(binName, argv);

    assert.equal(sut.error, undefined);
    assert.ok(sut.status !== 0 || sut.stdout + sut.stderr !== '', `${binName} exited 0 with no output through the link`);
  });
}
