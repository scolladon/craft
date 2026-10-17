'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TO_END, sliceProse, sliceRegion } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const DOC_SKILL_PATH = path.join(ROOT, 'skills', 'documentation', 'SKILL.md');
const RUN_SKILL_PATH = path.join(ROOT, 'skills', 'run', 'SKILL.md');
const RUN_RECORD_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md');
const SYNTHESIS_START = /^3\. \*\*Synthesis/;
const FOLDED_TOKEN = 'FOLDED(<file>):';
const FILED_TOKEN = 'FILED(<file>):';
const VOCABULARY_START = /^## Token vocabulary/;
const COMPACTION_START = /^## Compaction survival/;
const NEXT_H2 = /^## /;
const RUN_TOKENS_START = /^### Run-record tokens/;
const GREPPABLE_ONLY_TOKENS = ['DECISION-REVERSAL(ADR-NNN):', 'DECISION-CITE-WAIVE(<file>):',
  'MEMORY-RETRACT(<concern>):'];
const TABLE_ROW_PREFIX = '|';
const DESCRIPTION_START = /^description: /;
const FRONTMATTER_END = /^---$/;
const DOC_BULLET_START = /^\s+- `delivery` \(`documentation`\):/;
const PROPOSE_BULLET_START = /^\s+- `delivery` \(`propose`\):/;
const NOT_FOUND = -1;
const VERDICT_PHRASES = ['to one verdict, folded or filed', '`Not folded: `',
  'triaged before any backlog entry is authored',
  'the brief or the design lists as out of scope is filed, whatever the boundary says',
  'fold it with an ADR authored through the decisions flow, or file it',
  'It is never folded or filed silently',
  'the reason: out of scope, needs its own decision, needs a probe, waits on an external trigger, adds feature behaviour, or the fix did not pass its gate',
  'A triage EXCEPTION the background harness lands after this step gets the same triage before `propose`'];
const PAYLOAD_DISCIPLINE_PHRASES = ['repo-relative', '<main-repo-dir>',
  'no secret or env assignment'];
const SOURCE_FOLD_SUFFIX = '(outside the executing-harness run)';
const FILED_CARDINALITY_PHRASE = 'one line per locus file of each finding filed';
const SUB_STEP_MARKERS = ['**Inventory**', '**Triage**', '**Fold:**', '**File**'];
const BOUNDARY_PHRASES = ['git diff --name-only <base>...HEAD',
  'in at most one file outside the diff', 'contradicts what the diff now makes true',
  'add no feature behaviour', 'gates.part', 'outside the executing-harness run',
  'Not folded: the fix did not pass'];
const AUTHORING_PHRASE = 'new backlog follow-up entries';
const FOLD_PHRASE = 'fold in-scope findings';
const RETIRED_DESCRIPTION_PHRASE = 'author follow-ups';
const FILE_REST_PHRASE = 'file the rest';

const doc = fs.readFileSync(DOC_SKILL_PATH, 'utf8');
const spec = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');
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

test('Given the documentation skill\'s synthesis step, when its sub-steps and the entry-authoring phrase are located, then inventory, triage, fold and file come in that order', () => {
  const sut = synthesis;

  const indices = [...SUB_STEP_MARKERS, AUTHORING_PHRASE].map((marker) => sut.indexOf(marker));

  assert.ok(!indices.includes(NOT_FOUND), `missing marker at ${indices}`);
  assert.deepStrictEqual(indices, [...indices].sort((a, b) => a - b));
});

test('Given the documentation skill\'s synthesis step, when its record text is read, then it bounds the token payloads and marks a source fold', () => {
  const sut = synthesis;

  for (const phrase of [...PAYLOAD_DISCIPLINE_PHRASES, SOURCE_FOLD_SUFFIX]) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
});

test('Given the documentation skill\'s frontmatter, when its description is read, then it names folding in-scope findings and no longer says author follow-ups', () => {
  const sut = sliceProse(doc, DESCRIPTION_START, FRONTMATTER_END);

  assert.ok(sut.includes(FOLD_PHRASE));
  assert.ok(sut.includes(FILE_REST_PHRASE));
  assert.ok(!sut.includes(RETIRED_DESCRIPTION_PHRASE));
});

test('Given the run skill\'s delivery documentation bullet, when it is read up to the propose bullet, then it names the fold step', () => {
  const sut = sliceProse(run, DOC_BULLET_START, PROPOSE_BULLET_START);

  assert.ok(sut.includes(FOLD_PHRASE));
  assert.ok(sut.includes(FILE_REST_PHRASE));
});

test('Given the run-record spec, the run skill\'s token table and the documentation synthesis step, when each region is read, then each names both fold tokens', () => {
  const sut = {
    'run-record spec vocabulary': sliceProse(spec, VOCABULARY_START, NEXT_H2),
    'run skill token table': sliceProse(run, RUN_TOKENS_START, NEXT_H2),
    'documentation synthesis step': sliceProse(doc, SYNTHESIS_START, TO_END),
  };

  for (const [surface, region] of Object.entries(sut)) {
    assert.ok(region.includes(FOLDED_TOKEN), `${surface} lacks ${FOLDED_TOKEN}`);
    assert.ok(region.includes(FILED_TOKEN), `${surface} lacks ${FILED_TOKEN}`);
  }
});

test('Given the run-record spec\'s fold-token bullets, when the vocabulary is read, then FILED is one line per locus file, a source fold is marked and the payloads are bounded', () => {
  const sut = sliceProse(spec, VOCABULARY_START, NEXT_H2);

  for (const phrase of [FILED_CARDINALITY_PHRASE, SOURCE_FOLD_SUFFIX, ...PAYLOAD_DISCIPLINE_PHRASES]) {
    assert.ok(sut.includes(phrase), `missing: ${phrase}`);
  }
});

test('Given the run-record spec, when the token-vocabulary and compaction-survival regions are read, then the greppable-only tokens sit in the vocabulary and not under compaction survival', () => {
  const vocabulary = sliceProse(spec, VOCABULARY_START, NEXT_H2);
  const compaction = sliceProse(spec, COMPACTION_START, NEXT_H2);

  for (const token of GREPPABLE_ONLY_TOKENS) {
    assert.ok(vocabulary.includes(token), `vocabulary lacks ${token}`);
    assert.ok(!compaction.includes(token), `compaction survival still holds ${token}`);
  }
});

test('Given the run-record spec\'s parsed-token table, when its rows are read, then neither fold token has a regex row', () => {
  const sut = sliceRegion(spec, VOCABULARY_START, NEXT_H2)
    .split('\n')
    .filter((line) => line.startsWith(TABLE_ROW_PREFIX));

  for (const row of sut) {
    assert.ok(!row.includes('FOLDED('), `regex row for FOLDED: ${row}`);
    assert.ok(!row.includes('FILED('), `regex row for FILED: ${row}`);
  }
});
