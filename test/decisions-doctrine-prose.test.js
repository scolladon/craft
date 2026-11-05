'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { sliceProse } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const PREAMBLE = /^## Preamble/;
const PROCEDURE = /^## Procedure/;
const STEP_1 = /^1\. \*\*Triage/;
const STEP_2 = /^2\. \*\*Escalated candidates/;
const STEP_2B = /^2b\. \*\*Harvest/;
const STEP_3 = /^3\. \*\*No escalated/;
const STEP_4 = /^4\. \*\*Cross-candidate/;
const STEP_5 = /^5\. Author each/;
const STEP_6 = /^6\. \*\*Scope-fold/;
const HARVEST_TOKEN = 'DOCTRINE-HARVEST(<candidate>)';
const HARVEST_LINE = `${HARVEST_TOKEN}: D-<n> added | D-<n> amended | declined — <reason> | none — covered by D-<n> | none — one-off`;

const skill = () => fs.readFileSync(path.join(ROOT, 'skills', 'decisions', 'SKILL.md'), 'utf8');
const runRecordSpec = () =>
  fs.readFileSync(path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md'), 'utf8');

test('Given the decisions skill Procedure step 1, when read, then it names the three escalation triggers and the adopt bases', () => {
  const sut = skill();

  const result = sliceProse(sut, STEP_1, STEP_2);

  assert.match(result, /\(a\) its recommendation conflicts with an existing ADR/);
  assert.match(result, /\(b\) it is irreversible or outward-facing/);
  assert.match(result, /\(c\) it carries a real user-judgment trade-off that no ADR or doctrine entry covers/);
  assert.ok(result.includes('ADR-NNN, DOCTRINE(D-<n>), or "no trade-off"'));
});

test('Given the decisions skill Procedure step 1, when read, then it guards irreversible and conflicting choices against doctrine', () => {
  const sut = skill();

  const result = sliceProse(sut, STEP_1, STEP_2);

  assert.ok(result.includes('Read the doctrine file whole'));
  assert.ok(result.includes('Any trigger escalates; a covering entry never overrides (a) or (b).'));
  assert.ok(result.includes('a Rule that picks another option is a conflict (a)'));
  assert.ok(result.includes('an entry doctrine-lint flags covers nothing'));
});

test('Given the decisions skill, when read, then the stated craft principle phrase is absent', () => {
  const sut = skill();

  const result = sut.includes('stated craft principle');

  assert.equal(result, false);
});

test('Given the decisions skill, when read, then the old genuine-fork escalation criterion is absent', () => {
  const sut = skill();

  const result = /GENUINE FORK|Genuine forks|No genuine forks/.test(sut);

  assert.equal(result, false);
});

test('Given the decisions skill Preamble, when read, then it resolves paths.doctrine else docs/DOCTRINE.md and treats an absent file as no entries', () => {
  const sut = skill();

  const result = sliceProse(sut, PREAMBLE, PROCEDURE);

  assert.ok(result.includes('paths.doctrine'));
  assert.ok(result.includes('docs/DOCTRINE.md'));
  assert.match(result, /absent file means no entries/);
});

test('Given the decisions skill, when the harvest step is read, then it holds the token, always, and accept/edit/decline', () => {
  const sut = skill();

  const result = sliceProse(sut, STEP_2B, STEP_3);

  assert.ok(result.includes(`${HARVEST_LINE}`));
  assert.ok(result.includes("when the ruling differs from the design's recommendation or contradicts a doctrine entry: always."));
  assert.ok(result.includes('draft one only if that rationale reaches beyond this candidate'));
  assert.match(result, /accepts, edits or declines/);
});

test('Given the decisions skill Procedure, when read, then the harvest step precedes the cross-candidate check', () => {
  const sut = skill();

  const result = sliceProse(sut, STEP_2, STEP_5);

  const harvest = result.indexOf('2b. **Harvest');
  const crossCheck = result.indexOf('4. **Cross-candidate');

  assert.ok(harvest >= 0 && crossCheck >= 0);
  assert.ok(harvest < crossCheck);
});

test('Given the run-record spec Token vocabulary region, when read, then it lists the doctrine harvest token', () => {
  const sut = runRecordSpec();

  const result = sliceProse(sut, /^## Token vocabulary/, /^## Compaction survival/);

  assert.ok(result.includes(HARVEST_LINE));
});

test('Given the decisions skill step 3, when read, then the no-op token and the adopt bases are kept', () => {
  const sut = skill();

  const result = sliceProse(sut, STEP_3, STEP_4);

  assert.ok(result.includes('NO-OP(decisions): no user-judgment decisions — <justification>'));
  assert.match(result, /No escalated candidates/);
  assert.ok(result.includes('DOCTRINE(D-<n>)'));
  assert.ok(result.includes('**adopted-as-recommended (no user judgment)** — <basis>'));
});

test('Given the decisions skill step 4, when read, then a re-escalated adopted choice falls under trigger (c) and goes through the harvest', () => {
  const sut = skill();

  const result = sliceProse(sut, STEP_4, STEP_5);

  assert.ok(result.includes('under trigger (c)'));
  assert.ok(result.includes('its ruling goes through step 2b'));
});

test('Given the decisions skill step 5, when read, then the adopted marker carries a basis suffix', () => {
  const sut = skill();

  const result = sliceProse(sut, STEP_5, STEP_6);

  assert.ok(result.includes('**adopted-as-recommended (no user judgment)** — <basis>'));
});

test('Given the decisions skill step 5, when read, then the doctrine write lints through the shim and commits on its own', () => {
  const sut = skill();

  const result = sliceProse(sut, STEP_5, STEP_6);

  assert.ok(result.includes('**Doctrine write.**'));
  assert.ok(result.includes('${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/doctrine-lint.js'));
  assert.ok(result.includes('docs(doctrine): D-<n> <title>'));
  assert.ok(result.includes('never delete or renumber'));
  assert.ok(result.includes('commit only when it exits 0'));
  assert.ok(result.includes('a finding that predates this write is fixed in the same commit or escalated'));
  assert.ok(result.includes('cited as doctrine evidence or counter-case'));
  assert.match(result, /re-point the citation to the superseding ADR/);
});

test('Given the decisions skill, when scanned, then it holds no numbered ADR id and no numbered doctrine citation', () => {
  const sut = skill();

  const numberedAdr = /ADR-\d/.test(sut);
  const numberedDoctrine = /DOCTRINE\(D-\d/.test(sut);

  assert.equal(numberedAdr, false);
  assert.equal(numberedDoctrine, false);
});
