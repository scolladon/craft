'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const VALIDATION_SKILL = path.join(ROOT, 'skills', 'validation', 'SKILL.md');

// The digest pipe is the change's most load-bearing new procedure, and it lives in
// prose. An occurrence count cannot see a renamed bin or a renamed flag, so pin the
// prose against the engine's real CLI contract — and then run that contract.
function fencedBlocks(markdown) {
  return [...markdown.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
}

const skill = fs.readFileSync(VALIDATION_SKILL, 'utf8');

test('Given the validation skill mandates a digest pipe, then it names both engine bins and the scope flag', () => {
  const result = fencedBlocks(skill).find((b) => b.includes('filter-findings.js'));

  assert.ok(result, 'no bash block in the validation skill invokes filter-findings.js');
  assert.ok(result.includes('normalize-findings.js'), 'the pipe must name the normalizer');
  assert.ok(result.includes('--scope'), 'the pipe must pass --scope');
  assert.ok(result.includes('--repo-root'), 'the pipe must pass --repo-root');
});

test('Given the flags the skill documents, then the engine bin accepts them and scopes as promised', () => {
  const findings = JSON.stringify([
    { file: 'a.js', line: 3, severity: 'HIGH', finding: 'in scope' },
    { file: 'a.js', line: 300, severity: 'LOW', finding: 'out of scope' },
  ]);

  const result = execFileSync(
    'node',
    [path.join(ROOT, 'engine', 'bin', 'filter-findings.js'), '--scope', 'a.js:1-9', '--repo-root', ROOT],
    { input: findings, encoding: 'utf8' },
  );

  assert.deepEqual(JSON.parse(result), [
    { file: 'a.js', line: 3, severity: 'HIGH', finding: 'in scope' },
  ]);
});

test('Given a technique whose output is not canonical, then the skill routes it away from the pipe', () => {
  const start = skill.indexOf('non-canonical**');
  assert.notEqual(start, -1, 'the skill must describe the non-canonical route');
  const result = skill.slice(start, skill.indexOf('Read **only**', start));

  assert.match(result, /Do not pipe it/u);
  assert.ok(
    result.includes("let the technique's `triage-procedure` own the shaping"),
    'the non-canonical route must name who shapes the output, inside its own section',
  );
});
