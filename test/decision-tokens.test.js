'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const RUN_SKILL_PATH = path.join('skills', 'run', 'SKILL.md');
const RUN_RECORD_SPEC_PATH = path.join('docs', 'contributing', 'specs', 'run-record.md');
const DECISIONS_SKILL_PATH = path.join('skills', 'decisions', 'SKILL.md');
const REVIEW_SKILL_PATH = path.join('skills', 'review', 'SKILL.md');
const INTEGRATE_SKILL_PATH = path.join('skills', 'integrate', 'SKILL.md');
const ADR_LINT_MAIN_PATH = path.join('engine', 'src', 'adr-lint-main.js');

const NEW_TOKENS = ['DECISION-REVERSAL(', 'DECISION-CITE-WAIVE(', 'MEMORY-RETRACT('];

function grepCount(pattern, file) {
  try {
    const out = execFileSync('grep', ['-c', '-F', pattern, file], { cwd: ROOT, encoding: 'utf8' });
    return Number(out.trim());
  } catch (err) {
    if (err.status === 1) return 0; // grep: no match
    throw err;
  }
}

function presentSubset(file) {
  return NEW_TOKENS.filter((token) => grepCount(token, file) > 0);
}

test('Given the run skill and the run-record spec, when both are scanned for the three new tokens, then each document names all three', () => {
  const runSkillSubset = presentSubset(RUN_SKILL_PATH);
  const runRecordSpecSubset = presentSubset(RUN_RECORD_SPEC_PATH);

  assert.deepStrictEqual(runSkillSubset, NEW_TOKENS);
  assert.deepStrictEqual(runRecordSpecSubset, NEW_TOKENS);
});

test('Given skills/decisions/SKILL.md, when scanned, then it pins DECISION-REVERSAL(', () => {
  const count = grepCount('DECISION-REVERSAL(', DECISIONS_SKILL_PATH);
  assert.ok(count > 0, 'Expected literal DECISION-REVERSAL( in skills/decisions/SKILL.md');
});

test('Given skills/review/SKILL.md, when scanned, then it pins MEMORY-RETRACT(', () => {
  const count = grepCount('MEMORY-RETRACT(', REVIEW_SKILL_PATH);
  assert.ok(count > 0, 'Expected literal MEMORY-RETRACT( in skills/review/SKILL.md');
});

test('Given skills/integrate/SKILL.md, when scanned, then it pins MEMORY-RETRACT(', () => {
  const count = grepCount('MEMORY-RETRACT(', INTEGRATE_SKILL_PATH);
  assert.ok(count > 0, 'Expected literal MEMORY-RETRACT( in skills/integrate/SKILL.md');
});

test('Given engine/src/adr-lint-main.js, when scanned, then it pins DECISION-CITE-WAIVE', () => {
  const count = grepCount('DECISION-CITE-WAIVE', ADR_LINT_MAIN_PATH);
  assert.ok(count > 0, 'Expected literal DECISION-CITE-WAIVE in engine/src/adr-lint-main.js');
});
