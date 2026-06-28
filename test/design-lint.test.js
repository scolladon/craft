'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'design-lint.sh');
const GOOD_FIXTURE = path.join(__dirname, 'fixtures', 'design-good.md');
const MISSING_FIXTURE = path.join(__dirname, 'fixtures', 'design-missing.md');

test('good design fixture exits 0', () => {
  execFileSync('bash', [SCRIPT, GOOD_FIXTURE], { encoding: 'utf8' });
});

test('section-missing design fixture exits 2', () => {
  let err;
  try {
    execFileSync('bash', [SCRIPT, MISSING_FIXTURE], { encoding: 'utf8' });
    assert.fail('expected non-zero exit');
  } catch (e) {
    err = e;
  }
  assert.strictEqual(err.status, 2, 'expected exit status 2');
});

test('good design fixture stdout carries the section count summary', () => {
  const stdout = execFileSync('bash', [SCRIPT, GOOD_FIXTURE], { encoding: 'utf8' });
  assert.ok(stdout.includes('6 required sections present'), `expected the section-count summary in stdout; got: ${stdout}`);
});
