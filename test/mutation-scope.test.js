'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(ROOT, '.claude', 'workflow.md');

test('workflow.md documents per-hunk scope as ONE comma-joined --mutate flag', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf8');
  // Pins the exact combined single-flag form: --mutate "fileA:r1,fileB:r2"
  // Two separate --mutate flags cannot satisfy this; the comma must be INSIDE
  // the single quoted argument, not between two independent --mutate occurrences.
  assert.ok(
    content.includes('--mutate "fileA:r1,fileB:r2"'),
    'Expected a single --mutate "fileA:r1,fileB:r2" contract sentence in .claude/workflow.md'
  );
});

test('workflow.md documents the mutant-count plausibility check before trusting a green', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf8');
  assert.ok(
    content.includes('instrumented mutant count is >= the adjacent-hunk count'),
    'Expected mutant-count plausibility guidance in .claude/workflow.md'
  );
});
