'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TO_END, sliceProse, sliceRegion } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const PREAMBLE = /^## Preamble/;
const PROCEDURE = /^## Procedure/;
const MAX_HOW_TO_APPLY_LINES = 6;
const STEP_MARKERS = [
  '**Harvest.**',
  '**Draft, only with proof.**',
  '**Dedupe (merge before insert).**',
  '**Re-verify.**',
  '**Lint and commit.**',
  '**Record.**',
];

const skill = () => fs.readFileSync(path.join(ROOT, 'skills', 'lessons', 'SKILL.md'), 'utf8');

test('Given the lessons skill, when its frontmatter is read, then it is named lessons with a Craft lessons phase description', () => {
  const sut = skill();

  const result = sliceProse(sut, /^---$/, /^# /);

  assert.match(result, /name: lessons /);
  assert.match(result, /description: Craft lessons phase - /);
});

test('Given the lessons skill Preamble, when read, then it waits until awaitingHarnesses is empty', () => {
  const sut = skill();

  const result = sliceProse(sut, PREAMBLE, PROCEDURE);

  assert.match(result, /awaitingHarnesses/);
  assert.match(result, /empty/);
  assert.match(result, /wait/i);
});

test('Given the lessons skill Preamble, when read, then a standalone run records NO-OP(lessons): no run ledger', () => {
  const sut = skill();

  const result = sliceProse(sut, PREAMBLE, PROCEDURE);

  assert.ok(result.includes('NO-OP(lessons): no run ledger'));
});

test('Given the lessons skill Procedure, when read, then its steps run harvest, draft, dedupe, re-verify, lint, record in that order', () => {
  const sut = sliceProse(skill(), PROCEDURE, TO_END);

  const result = STEP_MARKERS.map((marker) => sut.indexOf(marker));

  assert.ok(result.every((index) => index >= 0), `missing step marker in ${result}`);
  assert.deepStrictEqual(result, [...result].sort((a, b) => a - b));
});

test('Given the lessons skill draft step, when read, then a draft needs an existing evidence path and the ledger is never evidence', () => {
  const sut = sliceProse(skill(), /\*\*Draft, only with proof\.\*\*/, /\*\*Dedupe/);

  assert.match(sut, /exists at `?HEAD`?/);
  assert.match(sut, /ledger[^.]*never evidence/);
  assert.match(sut, /no draft/);
});

test('Given the lessons skill draft step, when read, then How to apply holds at most 6 non-empty lines', () => {
  const sut = sliceProse(skill(), /\*\*Draft, only with proof\.\*\*/, /\*\*Dedupe/);

  const result = sut.match(/How to apply[^.]*?at most (\d+) non-empty lines/);

  assert.ok(result, 'How to apply line cap not stated');
  assert.strictEqual(Number(result[1]), MAX_HOW_TO_APPLY_LINES);
});

test('Given the lessons skill, when read, then it emits LESSONS: with the five outcomes', () => {
  const sut = sliceProse(skill(), /\*\*Record\.\*\*/, TO_END);

  const result = sut.includes('LESSONS: <path> (new|refreshed|reverified|superseded|retired)');

  assert.ok(result);
});

test('Given the lessons skill, when read, then it runs lesson-lint through the CRAFT_ROOT shim', () => {
  const sut = sliceRegion(skill(), PROCEDURE, TO_END);

  const result = sut.includes('${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/engine/bin/lesson-lint.js');

  assert.ok(result);
});

test('Given the PR body template, when its Provenance list is read, then it carries a Lessons line', () => {
  const content = fs.readFileSync(path.join(ROOT, 'templates', 'pr-body.md'), 'utf8');

  const result = sliceProse(content, /^### Provenance/, TO_END);

  assert.match(result, /- \*\*Lessons:\*\* /);
});

test('Given the lessons skill lint step, when read, then a red lint naming no draft of this run records a corpus NO-OP and commits nothing', () => {
  const sut = sliceProse(skill(), /\*\*Lint and commit\.\*\*/, /\*\*Record\.\*\*/);

  const result = sut;

  assert.ok(result.includes('NO-OP(lessons): corpus lint red on <file>'));
  assert.match(result, /names? no draft of this run/);
  assert.match(result, /never renumber or edit a committed lesson/);
});

test('Given the lessons skill lint command, when read, then the lessons directory argument is quoted', () => {
  const sut = sliceProse(skill(), /\*\*Lint and commit\.\*\*/, /\*\*Record\.\*\*/);

  const result = sut;

  assert.ok(result.includes('lesson-lint.js" "<lessons-dir>"'));
});

test('Given the lessons skill, when read, then drafts committed on the branch are not injected into this run and merging publishes them', () => {
  const sut = skill();

  const result = sliceProse(sut, /\*\*Lint and commit\.\*\*/, TO_END);

  assert.match(result, /not injected into this run/);
  assert.match(result, /default branch/);
  assert.match(result, /merging the PR ratifies and publishes/);
});

test('Given the lessons skill closing line, when read, then the phase never gates propose beyond its own lint of the drafts', () => {
  const sut = skill();

  const result = sut;

  assert.match(result, /never gates `propose` beyond its own lint of the drafts/);
  assert.ok(!result.includes('blocks `propose` only through'));
});
