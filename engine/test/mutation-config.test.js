import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_PATH = join(REPO_ROOT, 'engine', 'stryker.conf.json');

// A mutation run must load the tests that cover what it mutates and nothing
// else: a binding-wide glob drags in probe suites that spawn the real agent
// CLI, and on a machine where that CLI is installed the dry run hangs until
// Stryker times out. Pairing each mutated source with its own test file keeps
// the run hermetic.
function adapterSources(config) {
  return config.mutate.filter((path) => path.startsWith('adapters/'));
}

function expectedTestFileFor(sourcePath) {
  return sourcePath.replace('/src/', '/test/').replace(/\.js$/, '.test.js');
}

test('Given engine/stryker.conf.json, when every adapters/ mutate entry is inspected, then its own test file is listed in tap.testFiles', () => {
  const sut = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  const sources = adapterSources(sut);

  assert.ok(sources.length > 0, 'expected at least one adapters/ mutate entry to check');
  for (const source of sources) {
    const expected = expectedTestFileFor(source);
    assert.ok(
      sut.tap.testFiles.includes(expected),
      `mutate names ${source} but tap.testFiles is missing its covering test ${expected}`
    );
  }
});

test('Given engine/stryker.conf.json, when tap.testFiles is inspected, then it lists no adapters/ entry without a matching mutate source', () => {
  const sut = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  const expected = new Set(adapterSources(sut).map(expectedTestFileFor));
  const adapterTestFiles = sut.tap.testFiles.filter((path) => path.startsWith('adapters/'));

  for (const testFile of adapterTestFiles) {
    assert.ok(
      expected.has(testFile),
      `tap.testFiles names ${testFile} but no adapters/ mutate entry is covered by it`
    );
  }
});

test('Given engine/stryker.conf.json, when tap.testFiles names adapter tests, then no entry is a binding-wide glob', () => {
  const sut = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  const globbed = sut.tap.testFiles.filter((path) => path.startsWith('adapters/') && path.includes('*'));

  assert.deepEqual(globbed, [], 'adapter test globs pull in CLI-spawning suites and hang the dry run');
});

test('Given engine/stryker.conf.json, when every referenced path is resolved, then each one exists on disk', () => {
  const sut = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  const concrete = [...adapterSources(sut), ...sut.tap.testFiles.filter((p) => p.startsWith('adapters/'))];

  for (const path of concrete) {
    assert.ok(existsSync(join(REPO_ROOT, path)), `stryker.conf.json references ${path}, which does not exist`);
  }
});
