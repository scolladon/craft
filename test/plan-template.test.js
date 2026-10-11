'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'plan.md');
const GATE_HEADING = '### Gate';
const NEXT_HEADING = '\n### ';
const REPO_RELATIVE_PHRASE = 'repo-relative';

function gateGuidance(markdown) {
  const start = markdown.indexOf(GATE_HEADING);
  assert.notStrictEqual(start, -1, 'plan template has no Gate heading');
  const end = markdown.indexOf(NEXT_HEADING, start);
  return markdown.slice(start, end === -1 ? undefined : end);
}

test('Given the plan template, when its first ### Gate guidance is read, then it tells the planner to write gate commands repo-relative', () => {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  const result = gateGuidance(template);

  assert.ok(result.includes(REPO_RELATIVE_PHRASE));
});
