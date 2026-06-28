'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'backlog-lint.sh');
const GOOD_FIXTURE = path.join(__dirname, 'fixtures', 'backlog-good.md');
const MISSING_FIXTURE = path.join(__dirname, 'fixtures', 'backlog-missing.md');

test('good backlog fixture exits 0', () => {
  execFileSync('bash', [SCRIPT, GOOD_FIXTURE], { encoding: 'utf8' });
});

test('section-missing backlog fixture exits 2 and names missing section in stderr', () => {
  let err;
  try {
    execFileSync('bash', [SCRIPT, MISSING_FIXTURE], { encoding: 'utf8' });
    assert.fail('expected non-zero exit');
  } catch (e) {
    err = e;
  }
  assert.strictEqual(err.status, 2, 'expected exit status 2');
  assert.ok(
    (err.stderr || '').includes('Closed'),
    `expected "Closed" in stderr; got: ${err.stderr}`
  );
});

test('good backlog fixture stdout carries the section count summary', () => {
  const stdout = execFileSync('bash', [SCRIPT, GOOD_FIXTURE], { encoding: 'utf8' });
  assert.ok(stdout.includes('5 required sections present'), `expected the section-count summary in stdout; got: ${stdout}`);
});

test('live BACKLOG.md passes the generalized backlog linter', () => {
  execFileSync('bash', [SCRIPT, path.join(ROOT, 'BACKLOG.md')], { encoding: 'utf8' });
});

test('templates/backlog.md passes the generalized backlog linter', () => {
  execFileSync('bash', [SCRIPT, path.join(ROOT, 'templates', 'backlog.md')], { encoding: 'utf8' });
});
