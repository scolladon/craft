'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function grepCount(pattern, file) {
  try {
    const out = execFileSync('grep', ['-c', '-F', pattern, file], { cwd: ROOT, encoding: 'utf8' });
    return Number(out.trim());
  } catch (err) {
    if (err.status === 1) return 0; // grep: no match
    throw err;
  }
}

test('INTENTION-DRIFT( is pinned in the run skill', () => {
  const count = grepCount('INTENTION-DRIFT(', path.join('skills', 'run', 'SKILL.md'));
  assert.ok(count > 0, 'Expected literal INTENTION-DRIFT( in skills/run/SKILL.md');
});

test('INTENTION-DRIFT( is pinned in the validation skill', () => {
  const count = grepCount('INTENTION-DRIFT(', path.join('skills', 'validation', 'SKILL.md'));
  assert.ok(count > 0, 'Expected literal INTENTION-DRIFT( in skills/validation/SKILL.md');
});

test('INTENTION-WAIVE( is pinned in the run skill', () => {
  const count = grepCount('INTENTION-WAIVE(', path.join('skills', 'run', 'SKILL.md'));
  assert.ok(count > 0, 'Expected literal INTENTION-WAIVE( in skills/run/SKILL.md');
});

test('INTENTION-WAIVE( is pinned in the validation skill', () => {
  const count = grepCount('INTENTION-WAIVE(', path.join('skills', 'validation', 'SKILL.md'));
  assert.ok(count > 0, 'Expected literal INTENTION-WAIVE( in skills/validation/SKILL.md');
});
