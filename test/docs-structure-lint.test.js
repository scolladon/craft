'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createTmpGitRepo } = require('./helpers/tmp-git-repo');

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

// `cwd` matters: the script derives its git toplevel from the process's
// working directory (`git rev-parse --show-toplevel`, no `-C`), not from
// `dir`. Run it from inside the throwaway repo so that toplevel resolves to
// the repo under test rather than to this suite's own repo.
function sut(dir, cwd) {
  try {
    const stdout = execFileSync('bash', [SCRIPT, '--audience', dir], { encoding: 'utf8', cwd });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

// The dedupe used to join `top_level` into a single space-delimited string
// and glob-match against it, so a top-level entry name that itself contains a
// space could mask an unrelated later entry at the token boundary it created.
// A false PASS stays impossible here (masking names fail the spaceless
// allowlist and become offenders themselves) — this is a report-completeness
// bug: a real offender goes missing from the list, not from the verdict.
test('Given a top-level entry name containing a space, when --audience lints the tree, then the co-offender split at that space boundary is still reported', () => {
  // Arrange
  const { root, cleanup } = createTmpGitRepo([
    'docs/README.md',
    'docs/a b/note.md',
    'docs/b/note.md',
    'docs/contributing/note.md',
    'docs/guides/note.md',
  ]);

  try {
    // Act
    const result = sut(path.join(root, 'docs'), root);

    // Assert
    assert.strictEqual(result.status, 2, 'expected exit status 2');
    assert.match(result.stderr, /(^|\n) {2}a b($|\n)/, `expected "a b" reported; got: ${result.stderr}`);
    assert.match(result.stderr, /(^|\n) {2}b($|\n)/, `expected "b" reported; got: ${result.stderr}`);
  } finally {
    cleanup();
  }
});

test('Given two single-word top-level entries alongside their two-word union, when --audience lints the tree, then all three distinct entries are reported', () => {
  // Arrange
  const { root, cleanup } = createTmpGitRepo(['docs/x/note.md', 'docs/y/note.md', 'docs/x y/note.md']);

  try {
    // Act
    const result = sut(path.join(root, 'docs'), root);

    // Assert
    assert.strictEqual(result.status, 2, 'expected exit status 2');
    assert.match(result.stderr, /(^|\n) {2}x($|\n)/, `expected "x" reported; got: ${result.stderr}`);
    assert.match(result.stderr, /(^|\n) {2}y($|\n)/, `expected "y" reported; got: ${result.stderr}`);
    assert.match(result.stderr, /(^|\n) {2}x y($|\n)/, `expected "x y" reported; got: ${result.stderr}`);
  } finally {
    cleanup();
  }
});
