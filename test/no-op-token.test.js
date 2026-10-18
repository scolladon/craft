'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TO_END, sliceProse } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');

test('NO-OP(decisions): spelling pinned in decisions skill', () => {
  const content = fs.readFileSync(path.join(ROOT, 'skills', 'decisions', 'SKILL.md'), 'utf8');
  assert.ok(content.includes('NO-OP(decisions):'), 'Expected literal NO-OP(decisions): in skills/decisions/SKILL.md');
});

test('NO-OP(refactoring): spelling pinned in refactoring skill', () => {
  const content = fs.readFileSync(path.join(ROOT, 'skills', 'refactoring', 'SKILL.md'), 'utf8');
  assert.ok(content.includes('NO-OP(refactoring):'), 'Expected literal NO-OP(refactoring): in skills/refactoring/SKILL.md');
});

test('NO-OP(validation): spelling pinned in validation skill', () => {
  const content = fs.readFileSync(path.join(ROOT, 'skills', 'validation', 'SKILL.md'), 'utf8');
  assert.ok(content.includes('NO-OP(validation):'), 'Expected literal NO-OP(validation): in skills/validation/SKILL.md');
});

test('NO-OP(validation:<technique-id>): spelling pinned in validation skill', () => {
  const content = fs.readFileSync(path.join(ROOT, 'skills', 'validation', 'SKILL.md'), 'utf8');
  assert.ok(content.includes('NO-OP(validation:<technique-id>):'), 'Expected literal NO-OP(validation:<technique-id>): in skills/validation/SKILL.md');
});

test('NO-OP(architecture): spelling pinned in architecture skill', () => {
  const content = fs.readFileSync(path.join(ROOT, 'skills', 'architecture', 'SKILL.md'), 'utf8');
  assert.ok(content.includes('NO-OP(architecture):'), 'Expected literal NO-OP(architecture): in skills/architecture/SKILL.md');
});

test('NO-OP(architecture:<technique-id>): spelling pinned in architecture skill', () => {
  const content = fs.readFileSync(path.join(ROOT, 'skills', 'architecture', 'SKILL.md'), 'utf8');
  assert.ok(content.includes('NO-OP(architecture:<technique-id>):'), 'Expected literal NO-OP(architecture:<technique-id>): in skills/architecture/SKILL.md');
});

test('NO-OP(verify): spelling pinned in validation skill', () => {
  const content = fs.readFileSync(path.join(ROOT, 'skills', 'validation', 'SKILL.md'), 'utf8');
  assert.ok(content.includes('NO-OP(verify):'), 'Expected literal NO-OP(verify): in skills/validation/SKILL.md');
});

test('Given the planning skill, when read whole, then it names the NO-OP(planning) no part remains idiom', () => {
  const sut = fs.readFileSync(path.join(ROOT, 'skills', 'planning', 'SKILL.md'), 'utf8');

  const result = sut.includes('NO-OP(planning): no part remains — ');

  assert.ok(result, 'Expected the no part remains idiom in skills/planning/SKILL.md');
});

test('Given the planning skill Procedure, when the no-op branch is read, then it checks each cited sha against HEAD and base with merge-base is-ancestor', () => {
  const content = fs.readFileSync(path.join(ROOT, 'skills', 'planning', 'SKILL.md'), 'utf8');

  const result = sliceProse(content, /^## Procedure/, TO_END);

  assert.ok(result.includes('git merge-base --is-ancestor <sha> HEAD'));
  assert.ok(result.includes('git merge-base --is-ancestor <sha> <base>'));
});

test('Given the planner agent, when its final-message contract is read, then it allows the NO-OP no part remains return', () => {
  const content = fs.readFileSync(path.join(ROOT, 'agents', 'planner.md'), 'utf8');

  const result = sliceProse(content, /^- Final message:/, TO_END);

  assert.ok(result.includes('NO-OP: no part remains — '));
});

test('Given the run-record spec, when the greppable-only list is read, then it names both fixed no-op idioms', () => {
  const content = fs.readFileSync(path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md'), 'utf8');

  const result = sliceProse(content, /^The tokens below are greppable only/, /^## /);

  assert.ok(result.includes('NO-OP(planning): no part remains — <justification>'));
  assert.ok(result.includes('NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)'));
});
