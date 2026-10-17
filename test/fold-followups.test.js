'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TO_END, sliceProse } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const DOC_SKILL_PATH = path.join(ROOT, 'skills', 'documentation', 'SKILL.md');
const RUN_SKILL_PATH = path.join(ROOT, 'skills', 'run', 'SKILL.md');
const SYNTHESIS_START = /^3\. \*\*Synthesis/;
const DESCRIPTION_START = /^description: /;
const FRONTMATTER_END = /^---$/;
const DOC_BULLET_START = /^\s+- `delivery` \(`documentation`\):/;
const PROPOSE_BULLET_START = /^\s+- `delivery` \(`propose`\):/;
const NOT_FOUND = -1;
const VERDICT_PHRASES = ['folded', 'filed', '`Not folded: `', 'blocker protocol',
  'the brief or the design lists as out of scope'];
const BOUNDARY_PHRASES = ['git diff --name-only <base>...HEAD',
  'in at most one file outside the diff', 'contradicts what the diff now makes true',
  'add no feature behaviour', 'gates.part', 'outside the executing-harness run',
  'Not folded: the fix did not pass'];
const FOLD_STEP_PHRASE = 'Fold before file';
const AUTHORING_PHRASE = 'new backlog follow-up entries';
const FOLD_PHRASE = 'fold in-scope findings';
const RETIRED_DESCRIPTION_PHRASE = 'author follow-ups';
const FILE_REST_PHRASE = 'file the rest';

const doc = fs.readFileSync(DOC_SKILL_PATH, 'utf8');
const run = fs.readFileSync(RUN_SKILL_PATH, 'utf8');
const synthesis = sliceProse(doc, SYNTHESIS_START, TO_END);

test('Given the documentation skill\'s synthesis step, when its region is read, then it names both verdicts, the Not folded sentence, the user route for a decision and the brief-exclusion rule', () => {
  const sut = synthesis;

  for (const phrase of VERDICT_PHRASES) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
});

test('Given the documentation skill\'s synthesis step, when its region is read, then it states the scope boundary and what a fold may change', () => {
  const sut = synthesis;

  for (const phrase of BOUNDARY_PHRASES) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
});

test('Given the documentation skill\'s synthesis step, when the fold step and the entry-authoring phrase are located, then the fold step comes first', () => {
  const sut = synthesis;

  const foldIdx = sut.indexOf(FOLD_STEP_PHRASE);
  const authorIdx = sut.indexOf(AUTHORING_PHRASE);

  assert.notStrictEqual(foldIdx, NOT_FOUND);
  assert.notStrictEqual(authorIdx, NOT_FOUND);
  assert.ok(foldIdx < authorIdx);
});

test('Given the documentation skill\'s frontmatter, when its description is read, then it names folding in-scope findings and no longer says author follow-ups', () => {
  const sut = sliceProse(doc, DESCRIPTION_START, FRONTMATTER_END);

  assert.ok(sut.includes(FOLD_PHRASE));
  assert.ok(!sut.includes(RETIRED_DESCRIPTION_PHRASE));
});

test('Given the run skill\'s delivery documentation bullet, when it is read up to the propose bullet, then it names the fold step', () => {
  const sut = sliceProse(run, DOC_BULLET_START, PROPOSE_BULLET_START);

  assert.ok(sut.includes(FOLD_PHRASE));
  assert.ok(sut.includes(FILE_REST_PHRASE));
});
