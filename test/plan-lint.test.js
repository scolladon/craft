'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'plan-lint.sh');
const GOOD_FIXTURE = path.join(__dirname, 'fixtures', 'plan-good.md');
const MISSING_FIXTURE = path.join(__dirname, 'fixtures', 'plan-missing-section.md');

test('good plan fixture exits 0 printing "part(s) OK"', () => {
  const stdout = execFileSync('bash', [SCRIPT, GOOD_FIXTURE], { encoding: 'utf8' });
  assert.ok(stdout.includes('part(s) OK'), `stdout was: ${stdout}`);
});

test('section-missing plan fixture exits 2 printing "plan-lint:"', () => {
  let err;
  try {
    execFileSync('bash', [SCRIPT, MISSING_FIXTURE], { encoding: 'utf8' });
    assert.fail('expected non-zero exit');
  } catch (e) {
    err = e;
  }
  assert.strictEqual(err.status, 2, 'expected exit status 2');
  assert.ok((err.stdout || '').includes('plan-lint:'), `stdout was: ${err.stdout}`);
});

test('zero-argument invocation exits 2 printing usage on stderr', () => {
  let err;
  try {
    execFileSync('bash', [SCRIPT], { encoding: 'utf8' });
    assert.fail('expected non-zero exit');
  } catch (e) {
    err = e;
  }
  assert.strictEqual(err.status, 2, 'expected exit status 2');
  assert.ok((err.stderr || '').includes('plan-lint: usage:'), `stderr was: ${err.stderr}`);
});
