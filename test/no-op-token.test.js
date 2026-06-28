'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

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
