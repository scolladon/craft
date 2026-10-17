'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TO_END, sliceProse, sliceRegion } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const run = fs.readFileSync(path.join(ROOT, 'skills', 'run', 'SKILL.md'), 'utf8');
const workspace = fs.readFileSync(path.join(ROOT, 'skills', 'workspace', 'SKILL.md'), 'utf8');

const DRIVER_PROBE_START = /^0-driver\. /;
const STEP_0A = /^0a\. /;
const DRIVEN_STOP_START = /^- \*\*Driven stop\*\*/;
const POLICY_CONSULT = /^- \*\*Policy consult\*\*/;
const DONE_START = /^## Done/;
const DONE_HEADING = /^## Done/;
const HANDOFF_START = /^\*\*Driver hand-off\.\*\*/;
const FINAL_MESSAGE = /^Final message:/;
const ELECTION_START = /^\*\*Election \(driven runs only\)\.\*\*/;
const REBUILD_START = /^## Rebuild after compaction/;
const WORKSPACE_STEP_5 = /^5\. All subsequent work/;
const NOT_FOUND = -1;
const PRE_APPROVAL_FLAG_VALUE = '=always';

test('Given the run skill §0, when the driver-probe step is read, then it calls driver-state.sh active and continues undriven on exit 2', () => {
  const sut = sliceProse(run, DRIVER_PROBE_START, STEP_0A);

  for (const phrase of ['driver-state.sh" active', 'CRAFT_DRIVER_STATE', 'continue undriven']) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
});

test('Given the Rebuild section, when step 2 is read, then it re-runs driver-state.sh active', () => {
  const sut = sliceProse(run, REBUILD_START, DONE_HEADING);

  assert.ok(sut.includes('`driver-state.sh active`'));
});

test('Given the cross-phase invariants, when the Driven stop bullet is read, then its last call writes BLOCKED through driver-state.sh blocked and §0 stops use phase id resolve', () => {
  const sut = sliceProse(run, DRIVEN_STOP_START, POLICY_CONSULT);

  for (const phrase of ['"$driver" blocked <phase-id>', 'active >/dev/null &&',
    'phase id `resolve`', 'degrade-to-blocker', 'workspace collision']) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
});

test('Given the Done section, when read, then the ledger close precedes the hand-off which precedes the status write', () => {
  const sut = sliceProse(run, DONE_START, TO_END);

  const close = sut.indexOf('run-ledger.sh close');
  const handoff = sut.indexOf('Driver hand-off');
  const finished = sut.indexOf('"$driver" finished');
  assert.ok(close !== NOT_FOUND && close < handoff && handoff < finished);
  assert.ok(sut.includes('the last ledger action'));
  assert.ok(sut.includes('last tool call'));
});

test('Given the hand-off paragraph, when read, then it covers the no-merge status, the election files and the exit codes', () => {
  const sut = sliceProse(run, HANDOFF_START, FINAL_MESSAGE);

  for (const phrase of ['blocked integrate "not merged <pr-or-branch>"', 'next.md', 'next.prompt',
    'mktemp -d', 'Exit 3', 'Exit 4']) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
  assert.ok(!sut.includes(PRE_APPROVAL_FLAG_VALUE));
});

test('Given the election paragraph, when read, then it is driven-only, elects the first open unblocked file-backlog entry top-down, writes no election for custom or absent backlogs, and carries no pre-approval', () => {
  const sut = sliceProse(run, ELECTION_START, FINAL_MESSAGE);

  for (const phrase of ['driven runs only', 'source: file', 'first open entry', 'top-down',
    'unblocked', 'source: custom', 'no election']) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
  assert.ok(!sut.includes(PRE_APPROVAL_FLAG_VALUE));
});

test('Given the workspace skill step 5, when read, then the worktree is reached by absolute path and EnterWorktree is never used', () => {
  const sut = sliceProse(workspace, WORKSPACE_STEP_5, TO_END);

  for (const phrase of ['absolute path', 'cd <abs-worktree-path> &&', 'EnterWorktree',
    'Never move the session']) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
});

const DRIVER_SPEC = fs.readFileSync(path.join(ROOT, 'docs', 'contributing', 'specs', 'driver.md'), 'utf8');
const policySpec = fs.readFileSync(path.join(ROOT, 'docs', 'contributing', 'specs', 'policy.md'), 'utf8');
const ANY_H2 = /^## /;

test('Given the driver spec, when read, then it carries the status grammar lines and the exit-code rows for 2, 3 and 4', () => {
  const grammar = sliceProse(DRIVER_SPEC, /^## Status grammar/, ANY_H2);
  const exits = sliceRegion(DRIVER_SPEC, /^## Exit codes/, ANY_H2);

  for (const phrase of ['finished = "FINISHED " url', 'phase = ^[a-z][a-z0-9-]*$', 'reason = 1..240 chars']) {
    assert.ok(grammar.includes(phrase), `missing: ${phrase}`);
  }
  for (const row of ['| 2 |', '| 3 |', '| 4 |']) {
    assert.ok(exits.split('\n').some((line) => line.startsWith(row)), `missing row: ${row}`);
  }
  for (const phrase of ['CRAFT_DRIVER_STATE', '--resume', 'PermissionRequest']) {
    assert.ok(DRIVER_SPEC.includes(phrase), `missing: ${phrase}`);
  }
});

test("Given the policy spec's Claude binding, when read, then it links the driver spec", () => {
  const sut = sliceRegion(policySpec, /^## Claude binding/, /^## Pi binding/);

  assert.ok(sut.includes('driver.md'));
  assert.ok(sut.includes('--policy'));
});
