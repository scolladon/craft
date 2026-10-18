'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TO_END, sliceRegion, sliceProse } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const IMPLEMENTATION_ROW = /^\s*\| `implementation` \|/;
const REVIEW_ROW = /^\s*\| `review` \|/;
const FROM_TOP = /^/;

const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), 'utf8');

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
  const content = read('skills', 'planning', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, FROM_TOP, TO_END);

  assert.ok(result.includes('NO-OP(planning): no part remains — '));
});

test('Given the planning skill Procedure, when the no-op branch is read, then the HEAD check must succeed and the base check must exit exactly 1', () => {
  const content = read('skills', 'planning', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^## Procedure/, TO_END);

  assert.ok(result.includes('`git merge-base --is-ancestor <sha> HEAD` must exit 0'));
  assert.ok(result.includes('`git merge-base --is-ancestor <sha> <base>` must exit exactly 1'));
});

test('Given the planning skill Procedure, when the no-op branch is read, then an unresolvable base or an exit other than 0 or 1 escalates', () => {
  const content = read('skills', 'planning', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^## Procedure/, TO_END);

  assert.ok(result.includes("git rev-parse --verify --quiet '<base>^{commit}'"));
  assert.ok(result.includes('any other exit (128 included) escalates'));
});

test('Given the planning skill Procedure, when the no-op branch is read, then only hex shas resolved to commits are accepted', () => {
  const content = read('skills', 'planning', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^## Procedure/, TO_END);

  assert.ok(result.includes('`^[0-9a-f]{7,40}$`'));
  assert.ok(result.includes("git rev-parse --verify --quiet '<sha>^{commit}'"));
});

test('Given the planning skill Procedure, when the no-op branch is read, then every design requirement must be mapped', () => {
  const content = read('skills', 'planning', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^## Procedure/, TO_END);

  assert.ok(result.includes('every requirement id in the design doc'));
  assert.ok(result.includes('an empty or partial mapping fails'));
});

test('Given the planning skill Procedure, when the no-op branch is read, then a commit touching only the design doc or plan directory is rejected', () => {
  const content = read('skills', 'planning', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^## Procedure/, TO_END);

  assert.ok(result.includes('git diff-tree --no-commit-id --name-only -r'));
  assert.ok(result.includes('touches only the design doc or the plan directory'));
});

test('Given the planning skill and walk step 1, when base is read, then both define it as the workspace default-branch probe', () => {
  const planning = read('skills', 'planning', 'SKILL.md');
  const run = read('skills', 'run', 'SKILL.md');
  const sut = sliceProse;

  const planningResult = sut(planning, /^## Procedure/, TO_END);
  const runResult = sut(run, /^1\. \*\*Necessity probe/, /^2\. \*\*Resolve the skill\*\*/);

  const definition = '`<base>` is the default branch the workspace phase probed (`origin/HEAD` → `main` → `master`)';
  assert.ok(planningResult.includes(definition));
  assert.ok(runResult.includes(definition));
});

test('Given the planner agent, when its final-message contract is read, then it allows the NO-OP no part remains return', () => {
  const content = read('agents', 'planner.md');
  const sut = sliceProse;

  const result = sut(content, /^- Final message:/, TO_END);

  assert.ok(result.includes('NO-OP: no part remains — '));
});

test('Given the planner agent, when its no-op bullet is read, then only commits this run landed count', () => {
  const content = read('agents', 'planner.md');
  const sut = sliceProse;

  const result = sut(content, /^- No-op:/, /^- Final message:/);

  assert.ok(result.includes('a commit this run landed after its base'));
  assert.ok(result.includes('already true before the run is planned'));
});

test('Given the run-record spec, when the greppable-only list is read, then it names both fixed no-op idioms', () => {
  const content = read('docs', 'contributing', 'specs', 'run-record.md');
  const sut = sliceProse;

  const result = sut(content, /^The tokens below are greppable only/, /^## /);

  assert.ok(result.includes('NO-OP(planning): no part remains — <justification>'));
  assert.ok(result.includes('NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)'));
});

test('Given the implementation Preamble, when read, then it names the NO-OP(implementation) idiom and keys on NO-OP(planning)', () => {
  const content = read('skills', 'implementation', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^## Preamble/, /^## Procedure/);

  assert.ok(result.includes('NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)'));
  assert.ok(result.includes("grep -F 'NO-OP(planning):'"));
});

test('Given the implementation Preamble, when the no-op branch is read, then it still runs the phase gate', () => {
  const content = read('skills', 'implementation', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^## Preamble/, /^## Procedure/);

  assert.ok(result.includes('`gates.phase` once'));
  assert.ok(result.includes('GATE(implementation): green'));
});

test('Given the implementation Preamble, when a red no-op gate is read, then the phase closes only after a green re-run', () => {
  const content = read('skills', 'implementation', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^## Preamble/, /^## Procedure/);

  assert.ok(result.includes('`GATE(implementation): red` without `PHASE-DONE`'));
  assert.ok(result.includes('`PHASE-DONE` lands only with a green gate'));
});

test('Given walk step 7, when read, then both planning and implementation no-ops are produced outcomes', () => {
  const content = read('skills', 'run', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^7\. \*\*Record outcome\*\*/, /^8\. \*\*On blocker\*\*/);

  assert.ok(result.includes('NO-OP(planning): no part remains'));
  assert.ok(result.includes('NO-OP(implementation): no plan parts'));
});

test('Given walk step 1, when the necessity-probe region is read, then an implementation no-op evaluates the downstream signals over base...HEAD', () => {
  const content = read('skills', 'run', 'SKILL.md');
  const sut = sliceProse;

  const result = sut(content, /^1\. \*\*Necessity probe/, /^2\. \*\*Resolve the skill\*\*/);

  assert.ok(result.includes('NO-OP(implementation):'));
  assert.ok(result.includes('<base>...HEAD'));
});

test('Given the implementation resume row, when read, then it covers a missing plan with a NO-OP(planning) line', () => {
  const content = read('skills', 'run', 'SKILL.md');
  const sut = sliceRegion;

  const result = sut(content, IMPLEMENTATION_ROW, REVIEW_ROW);

  assert.ok(result.includes('NO-OP(planning):'));
  assert.ok(result.includes('NO-OP(implementation)'));
});

test('Given the implementation resume row, when a red no-op gate is read, then the phase closes only on a green gate', () => {
  const content = read('skills', 'run', 'SKILL.md');
  const sut = sliceRegion;

  const result = sut(content, IMPLEMENTATION_ROW, REVIEW_ROW);

  assert.ok(result.includes('close the phase only on a green gate'));
});
