'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'docs-structure-lint.sh');
const GOOD_FIXTURE = path.join(__dirname, 'fixtures', 'docs-structure-good');
const BAD_FIXTURE = path.join(__dirname, 'fixtures', 'docs-structure-bad');
const AUDIENCE_GOOD_FIXTURE = path.join(__dirname, 'fixtures', 'docs-audience-good');
const AUDIENCE_STRAY_FILE_FIXTURE = path.join(__dirname, 'fixtures', 'docs-audience-stray-file');
const AUDIENCE_STRAY_DIR_FIXTURE = path.join(__dirname, 'fixtures', 'docs-audience-stray-dir');

test('docs/archive/-clean fixture tree exits 0', () => {
  execFileSync('bash', [SCRIPT, GOOD_FIXTURE], { encoding: 'utf8' });
});

test('a dated doc planted outside docs/archive/ exits 2 and names it in stderr', () => {
  let err;
  try {
    execFileSync('bash', [SCRIPT, BAD_FIXTURE], { encoding: 'utf8' });
    assert.fail('expected non-zero exit');
  } catch (e) {
    err = e;
  }
  assert.strictEqual(err.status, 2, 'expected exit status 2');
  assert.ok(
    (err.stderr || '').includes('DESIGN-P9-foo.md'),
    `expected "DESIGN-P9-foo.md" in stderr; got: ${err.stderr}`
  );
});

test('live docs/ tree passes after the archive sweep', () => {
  execFileSync('bash', [SCRIPT, path.join(ROOT, 'docs', 'contributing')], { encoding: 'utf8' });
});

test('--audience: a tracked README.md + guides/ + contributing/ top level exits 0', () => {
  execFileSync('bash', [SCRIPT, '--audience', AUDIENCE_GOOD_FIXTURE], { encoding: 'utf8' });
});

test('--audience: a stray tracked file at the top level exits 2 and names it in stderr', () => {
  let err;
  try {
    execFileSync('bash', [SCRIPT, '--audience', AUDIENCE_STRAY_FILE_FIXTURE], { encoding: 'utf8' });
    assert.fail('expected non-zero exit');
  } catch (e) {
    err = e;
  }
  assert.strictEqual(err.status, 2, 'expected exit status 2');
  assert.ok(
    (err.stderr || '').includes('STRAY.md'),
    `expected "STRAY.md" in stderr; got: ${err.stderr}`
  );
});

test('--audience: a stray tracked directory at the top level exits 2 and names it in stderr', () => {
  let err;
  try {
    execFileSync('bash', [SCRIPT, '--audience', AUDIENCE_STRAY_DIR_FIXTURE], { encoding: 'utf8' });
    assert.fail('expected non-zero exit');
  } catch (e) {
    err = e;
  }
  assert.strictEqual(err.status, 2, 'expected exit status 2');
  assert.ok(
    (err.stderr || '').includes('extra'),
    `expected "extra" in stderr; got: ${err.stderr}`
  );
});

test('--audience: the live docs/ top level is exactly README.md + guides + contributing', () => {
  execFileSync('bash', [SCRIPT, '--audience', path.join(ROOT, 'docs')], { encoding: 'utf8' });

  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '--', 'docs'], { encoding: 'utf8' });
  const topLevel = new Set(
    tracked
      .split('\n')
      .filter(Boolean)
      .map((f) => f.slice('docs/'.length).split('/')[0])
  );
  assert.deepStrictEqual(topLevel, new Set(['README.md', 'guides', 'contributing']));
});
