'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'docs-structure-lint.sh');
const GOOD_FIXTURE = path.join(__dirname, 'fixtures', 'docs-structure-good');
const BAD_FIXTURE = path.join(__dirname, 'fixtures', 'docs-structure-bad');

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
  execFileSync('bash', [SCRIPT, path.join(ROOT, 'docs')], { encoding: 'utf8' });
});
