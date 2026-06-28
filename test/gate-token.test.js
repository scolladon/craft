'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('Given skills/run/SKILL.md, when its content is checked, then it contains the fixed greppable token GATE(', () => {
  const content = fs.readFileSync(path.join(ROOT, 'skills', 'run', 'SKILL.md'), 'utf8');
  assert.ok(content.includes('GATE('), 'Expected literal GATE( in skills/run/SKILL.md');
});
