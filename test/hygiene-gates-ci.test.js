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

function ciContent() {
  return fs.readFileSync(CI_SCRIPT, 'utf8');
}

function invocationLine(content, bin) {
  return content.split('\n').find((l) => l.includes(bin) && l.includes('--gate')) || '';
}

function functionBody(content, name) {
  // crude but sufficient: from `name() {` to the next line that is a lone `}`
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${name}() {`));
  if (start === -1) return '';
  const end = lines.slice(start + 1).findIndex((l) => l === '}');
  return lines.slice(start, start + 1 + end).join('\n');
}

test('Given scripts/ci.sh, when its content is read, then compute_touched runs once and core.quotepath=false is gone', () => {
  const content = ciContent();

  const callSites = (content.match(/compute_touched(?!\()/g) || []).length;
  assert.equal(callSites, 1, `compute_touched should be invoked once, found ${callSites}`);
  assert.ok(!content.includes('core.quotepath=false'), 'core.quotepath=false is redundant under -z and must be dropped');
});

test('Given scripts/ci.sh, when its content is read, then it passes the RESOLVED gate variable + -- to both bins', () => {
  const content = ciContent();

  assert.ok(content.includes('hygiene-gate.js'), 'expected ci.sh to resolve the gate via hygiene-gate.js');
  // the invocation must flow the resolved $hygiene_gate variable, not a hardcoded literal
  const flowsResolvedGate = /--gate\s+"?\$\{?hygiene_gate\}?"?/;

  const stub = invocationLine(content, 'stub-lint.js');
  assert.match(stub, flowsResolvedGate, `stub-lint --gate must flow $hygiene_gate: ${stub}`);
  assert.ok(stub.includes(' -- '), `stub-lint invocation should pass a -- end-of-options sentinel: ${stub}`);

  const prose = invocationLine(content, 'prose-lint.js');
  assert.match(prose, flowsResolvedGate, `prose-lint --gate must flow $hygiene_gate: ${prose}`);
  assert.ok(prose.includes(' -- '), `prose-lint invocation should pass a -- end-of-options sentinel: ${prose}`);
});

test('Given scripts/ci.sh, when its content is read, then it surfaces the gate reason (no 2>/dev/null on the resolver)', () => {
  const content = ciContent();

  const gateLine = content.split('\n').find((l) => l.includes('hygiene-gate.js') && l.includes('hygiene_gate=')) || '';
  assert.ok(gateLine, 'expected a hygiene_gate assignment from hygiene-gate.js');
  assert.ok(!gateLine.includes('2>/dev/null'), `a typo'd gate must surface its reason, not be swallowed: ${gateLine}`);
});

test('Given scripts/ci.sh, when its content is read, then run_prose_lint excludes provenance/design docs in a skip arm', () => {
  const content = ciContent();
  const body = functionBody(content, 'run_prose_lint');
  assert.ok(body, 'expected a run_prose_lint function body');

  // the provenance globs must sit in an EMPTY (skip) case arm, not the inclusion arm
  assert.match(
    body,
    /docs\/adr\/\*\|docs\/design\/\*\|docs\/archive\/\*\)\s*;;/,
    `provenance dirs must be a skipped case arm inside run_prose_lint: ${body}`,
  );
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
