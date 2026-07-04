'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CI_SCRIPT = path.join(ROOT, 'scripts', 'ci.sh');
const RUN_SKILL = path.join(ROOT, 'skills', 'run', 'SKILL.md');

test('Given scripts/ci.sh, when its content is read, then it defines and calls both hygiene gate functions', () => {
  const content = fs.readFileSync(CI_SCRIPT, 'utf8');

  assert.ok(content.includes('run_stub_lint'), 'expected scripts/ci.sh to define run_stub_lint');
  assert.ok(content.includes('run_prose_lint'), 'expected scripts/ci.sh to define run_prose_lint');
  assert.match(content, /^run_stub_lint$/m, 'expected scripts/ci.sh to call run_stub_lint');
  assert.match(content, /^run_prose_lint$/m, 'expected scripts/ci.sh to call run_prose_lint');
});

test('Given scripts/ci.sh, when the hygiene block is located, then it sits after the lint chain and non-adjacent to run_intention_lint', () => {
  const content = fs.readFileSync(CI_SCRIPT, 'utf8');
  const intentionIdx = content.indexOf('run_intention_lint');
  const lintChainIdx = content.indexOf('shellcheck scripts');
  const stubLintIdx = content.indexOf('run_stub_lint');

  assert.ok(intentionIdx >= 0, 'expected run_intention_lint to be present');
  assert.ok(lintChainIdx >= 0, 'expected the shellcheck lint chain to be present');
  assert.ok(stubLintIdx >= 0, 'expected run_stub_lint to be present');
  assert.ok(
    intentionIdx < lintChainIdx && lintChainIdx < stubLintIdx,
    'expected run_intention_lint < shellcheck lint chain < run_stub_lint ordering'
  );
});

test('Given skills/run/SKILL.md, when its content is read, then it documents the STUB and SLOP run-record tokens', () => {
  const content = fs.readFileSync(RUN_SKILL, 'utf8');

  assert.ok(content.includes('STUB-FOUND(<file>):'), 'expected STUB-FOUND(<file>): token');
  assert.ok(content.includes('STUB-WAIVE(<file>):'), 'expected STUB-WAIVE(<file>): token');
  assert.ok(content.includes('SLOP-FOUND(<file>):'), 'expected SLOP-FOUND(<file>): token');
  assert.ok(content.includes('SLOP-WAIVE(<file>):'), 'expected SLOP-WAIVE(<file>): token');
});
