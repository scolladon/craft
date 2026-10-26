'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { sliceProse, sliceRegion, TO_END } = require('./helpers/region-slice');
const ROOT = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), 'utf8');

const SPEC = read('docs', 'contributing', 'specs', 'run-record.md');
const vocabulary = () => sliceRegion(SPEC, /^## Token vocabulary/, /^## (?!Token vocabulary)/);

test('Given the run-record spec run directory block, when read, then it names the impacts store', () => {
  const sut = sliceProse(SPEC, /^## Run directory/, /^## Token vocabulary/);

  assert.ok(sut.includes('<run-id>.impacts.md'));
});

test('Given the run-record spec vocabulary, when read, then it names both impact tokens', () => {
  const sut = vocabulary();

  assert.ok(sut.includes('DEFERRED(<file>): I<n> <title>'));
  assert.ok(sut.includes('TRIAGED(I<n>): <verdict> — <rationale>'));
});

test('Given the run-record spec vocabulary table rows, when read, then no row names an impact token', () => {
  const rows = vocabulary().split('\n').filter((line) => line.startsWith('|'));

  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => !row.includes('DEFERRED(') && !row.includes('TRIAGED(')));
});

test('Given the run-record write cadence, when read, then it lists defer and verdict', () => {
  const sut = sliceRegion(SPEC, /^## Write cadence/, /^## (?!Write cadence)/);

  assert.ok(sut.includes('**`defer`**'));
  assert.ok(sut.includes('**`verdict`**'));
});

test('Given the PR body template, when its Provenance list is read, then it carries a Discovered impacts line', () => {
  const sut = sliceProse(read('templates', 'pr-body.md'), /^### Provenance/, TO_END);

  assert.ok(sut.includes('- **Discovered impacts:** '));
});

test('Given the backlog spec Filing section, when read, then filing is not a port operation and a custom source files nothing', () => {
  const sut = sliceProse(read('docs', 'contributing', 'specs', 'backlog.md'), /^## Filing/, /^## (?!Filing)/);

  assert.ok(sut.includes('not a port operation'));
  assert.ok(sut.includes('source: custom'));
  assert.ok(sut.includes('NO-OP(impact-triage): no file-backed backlog — verdicts in the PR body only'));
});

const impactSkill = () => read('skills', 'impact-triage', 'SKILL.md');

test('Given the impact-triage skill, when its preamble is read, then it waits for awaitingHarnesses and names its heading', () => {
  const skill = impactSkill();

  const sut = sliceProse(skill, /^## Preamble/, /^## Procedure/);

  assert.ok(skill.includes('# craft:impact-triage'));
  assert.ok(sut.includes('Cross-phase wait'));
  assert.ok(sut.includes('awaitingHarnesses'));
});

test('Given the impact-triage procedure, when read, then the verdict table comes before the backlog-write consult and FILED comes after the commit', () => {
  const sut = sliceProse(impactSkill(), /^## Procedure/, TO_END);

  const table = sut.indexOf('verdict table');
  const consult = sut.indexOf('`backlog-write`');
  const commit = sut.indexOf('docs(<slug>): file triaged impacts');
  const filed = sut.indexOf('FILED(<file>): I<n>');
  assert.ok(table >= 0 && consult >= 0 && commit >= 0 && filed >= 0);
  assert.ok(table < consult);
  assert.ok(commit < filed);
});

test('Given the impact-triage procedure, when read, then it records verdicts through the script, frames spikes and writes the trailer line', () => {
  const sut = sliceProse(impactSkill(), /^## Procedure/, TO_END);

  assert.ok(sut.includes('verdict <run-id> I<n>'));
  assert.ok(sut.includes('Spike — '));
  assert.ok(sut.includes('Question: '));
  assert.ok(sut.includes('**Discovered impacts:**'));
  assert.ok(sut.includes('NO-OP(impact-triage): no file-backed backlog — verdicts in the PR body only'));
});

const RUN_SKILL = read('skills', 'run', 'SKILL.md');

test('Given the run skill impacts invariant, when its region is read, then it names fold, defer, the defer verb, the user route and the no-proof refusal', () => {
  const sut = sliceProse(RUN_SKILL, /^- \*\*Impacts: fold or defer at discovery\*\*/, /^- \*\*Artifact is the handoff\*\*/);

  for (const phrase of ['folded or deferred', 'run-ledger.sh defer', 'blocker protocol', 'No proof, no entry', 'IMPACT(', 'never while a role agent is working in the tree']) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
});

test('Given the run skill token table, when read, then it names both impact tokens and moves FILED to impact-triage', () => {
  const sut = sliceProse(RUN_SKILL, /^### Run-record tokens/, /^## /);

  for (const phrase of ['DEFERRED(<file>): I<n> <title>', 'TRIAGED(I<n>): <verdict> — <rationale>', 'FILED(<file>): I<n> <title> — not folded: <reason>']) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
});

test('Given walk step 1 and step 5, when read, then impact-triage auto-skips on no DEFERRED line and waits for awaitingHarnesses', () => {
  const probe = sliceProse(RUN_SKILL, /^1\. \*\*Necessity probe/, /^2\. \*\*Resolve the skill\*\*/);
  const whole = sliceProse(RUN_SKILL, /^# /, TO_END);

  assert.ok(probe.includes('auto-skip: impact-triage — evaluated unnecessary (no deferred findings)'));
  assert.match(whole, /- `delivery` \(`impact-triage`\):.*?awaitingHarnesses/);
});

test('Given the rebuild resume table, when read, then it carries an impact-triage row', () => {
  const sut = sliceProse(RUN_SKILL, /^## Rebuild after compaction/, /^## Done/);

  assert.ok(sut.includes('| `impact-triage` |'));
  assert.ok(sut.includes('re-spawn over the missing ids only'));
});

test('Given section 0 and the Done close paragraph, when read, then open creates and close removes the impacts store', () => {
  const sut = sliceProse(RUN_SKILL, /^## Done/, TO_END);

  assert.ok(RUN_SKILL.includes('<run-id>.impacts.md'));
  assert.ok(sut.includes('the ledger and the impacts store'));
});

test('Given the documentation synthesis step, when read, then it defers through the script and authors no backlog entry', () => {
  const sut = sliceProse(read('skills', 'documentation', 'SKILL.md'), /^3\. \*\*Synthesis/, TO_END);

  assert.ok(sut.includes('run-ledger.sh defer'));
  assert.ok(sut.includes('**Defer**'));
  assert.ok(!sut.includes('new backlog follow-up entries'));
  assert.ok(!sut.includes('FILED('));
});

test('Given the documentation frontmatter, when read, then it defers the rest to impact triage', () => {
  const sut = sliceProse(read('skills', 'documentation', 'SKILL.md'), /^description: /, /^---$/);

  assert.ok(sut.includes('defer the rest to impact triage'));
});

test('Given the documentation PR-body draft, when read, then it writes the discovered-impacts line as triage pending', () => {
  const sut = sliceProse(read('skills', 'documentation', 'SKILL.md'), /^3\. \*\*Synthesis/, TO_END);

  assert.ok(sut.includes('**Discovered impacts:**'));
  assert.ok(sut.includes('triage pending'));
});

test('Given the core contract and the part-implementer agent, when read, then both name the IMPACT line', () => {
  const core = read('contracts', 'core.md');
  const agent = read('agents', 'part-implementer.md');

  assert.ok(core.includes('IMPACT(<file>): <finding> — proof:'));
  assert.ok(agent.includes('IMPACT('));
});

test('Given the implementation skill step 2, when read, then each handback impact gets a verdict before the next part', () => {
  const sut = sliceProse(read('skills', 'implementation', 'SKILL.md'), /^2\. \*\*After each agent returns/, /^3\. \*\*Phase-boundary gate/);

  assert.ok(sut.includes('IMPACT('));
  assert.ok(sut.includes('Impacts: fold or defer at discovery'));
});

test('Given the refactoring skill steps 3 and 4, when read, then they defer and no longer say follow-up', () => {
  const sut = sliceProse(read('skills', 'refactoring', 'SKILL.md'), /^3\. \*\*Candidates survive/, /^5\. Order rationale/);

  assert.ok(!sut.includes('follow-up'));
  assert.ok(sut.includes('deferred'));
});

test('Given the review fix step, when read, then an out-of-scope finding is an impact', () => {
  const sut = sliceProse(read('skills', 'review', 'SKILL.md'), /^3\. \*\*Fixes — session-owned:\*\*/, /^4\. \*\*Converge/);

  assert.ok(sut.includes('Impacts: fold or defer at discovery'));
});

test('Given the validation and architecture triage steps, when read, then a triager IMPACT line gets a verdict', () => {
  const validation = sliceProse(read('skills', 'validation', 'SKILL.md'), /^2\. \*\*The PR waits for triage\*\*/, /^3\. \*\*Never destroy/);
  const architecture = sliceProse(read('skills', 'architecture', 'SKILL.md'), /^3\. Verify the triager's commit/, TO_END);

  for (const sut of [validation, architecture]) {
    assert.ok(sut.includes('IMPACT('));
    assert.ok(sut.includes('Impacts: fold or defer at discovery'));
  }
});
