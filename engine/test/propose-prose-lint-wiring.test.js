import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'propose', 'SKILL.md');

function proseLintLine(content) {
  return content.split('\n').find((l) => l.includes('prose-lint.js')) || '';
}

test('Given skills/propose/SKILL.md, when read, then it scans the drafted PR body with prose-lint advisorily', () => {
  const content = readFileSync(SKILL, 'utf8');

  const line = proseLintLine(content);
  assert.ok(line, 'propose should invoke prose-lint.js over the body');
  assert.ok(line.includes('--gate'), `prose-lint should honor the hygiene.gate knob via --gate: ${line}`);
  assert.ok(line.includes('--waiver-source'), `prose-lint should pass the body as its own waiver source: ${line}`);
  assert.ok(line.includes(' -- '), `prose-lint should pass a -- end-of-options sentinel: ${line}`);
});

test('Given skills/propose/SKILL.md, when read, then it resolves the gate and honors the SLOP-WAIVE waiver, PR-body-only', () => {
  const content = readFileSync(SKILL, 'utf8');

  assert.ok(content.includes('hygiene-gate.js'), 'propose should resolve the posture via hygiene-gate.js');
  assert.ok(content.includes('SLOP-WAIVE'), 'propose should reference the SLOP-WAIVE waiver');
  assert.ok(content.includes('SLOP-FOUND'), 'propose should fold SLOP-FOUND lines into the record/body');
  assert.ok(/PR body only|PR-body only|body only/i.test(content), 'propose should scope prose-lint to the PR body, not the ci.sh cadence');
});
