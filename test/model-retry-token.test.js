'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RUN_SKILL_PATH = path.join(ROOT, 'skills', 'run', 'SKILL.md');
const MODEL_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs', 'model.md');
const RUN_RECORD_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md');

const RETRY_TOKEN = 'MODEL-RETRY(';
const DEGRADED_TOKEN = 'MODEL-DEGRADED(';
const MODEL_TOKENS = [RETRY_TOKEN, DEGRADED_TOKEN];
const SAME_TIER_RETRY_PHRASE = 'retried ONCE on the same tier';
const TRANSIENT_RETRY_BULLET = '**Transient-overload retry**';
const RETIRED_SKILL_PHRASE = '(model down/overloaded/unknown';
const RETIRED_MODEL_SPEC_PHRASES = [
  'a model-availability error marks the tier degraded',
  'the model is down, overloaded, or returns an availability error',
  'it triggers core fallback re-resolution',
  'error triggers core fallback re-resolution',
];
const CHAIN_START = "→ the descriptor's `model:` field";
const CHAIN_END = '→ session model';

function normaliseWhitespace(text) {
  return text.replace(/\s+/g, ' ');
}

// Bounded slice so a token mentioned in an unrelated section cannot satisfy a
// region-scoped pin; a missing boundary fails loudly rather than widening to the
// whole file. Whitespace is collapsed so indented, word-wrapped bullets still match.
function sliceRegion(content, startPattern, endPattern) {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((line) => startPattern.test(line));
  assert.notEqual(startIdx, -1, `region start ${startPattern} not found — heading renamed?`);
  const relativeEnd = lines.slice(startIdx + 1).findIndex((line) => endPattern.test(line));
  assert.notEqual(relativeEnd, -1, `region end ${endPattern} not found — heading renamed?`);
  return normaliseWhitespace(lines.slice(startIdx, startIdx + 1 + relativeEnd).join(' '));
}

function resolutionChainOf(content) {
  const text = normaliseWhitespace(content);
  const startIdx = text.indexOf(CHAIN_START);
  assert.notEqual(startIdx, -1, `chain start ${CHAIN_START} not found`);
  const endIdx = text.indexOf(CHAIN_END, startIdx);
  assert.notEqual(endIdx, -1, `chain end ${CHAIN_END} not found`);
  return text.slice(startIdx, endIdx + CHAIN_END.length);
}

const runSkill = fs.readFileSync(RUN_SKILL_PATH, 'utf8');
const modelSpec = fs.readFileSync(MODEL_SPEC_PATH, 'utf8');
const runRecordSpec = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');

const invariantBullet = () =>
  sliceRegion(runSkill, /^- \*\*Model resolution & fallback\*\*/, /^- \*\*Blockers\*\*/);

test("Given skills/run/SKILL.md and docs/contributing/specs/model.md, when the resolution chain from the descriptor's model field to the session model is normalised, then both files state it identically", () => {
  const sut = resolutionChainOf(runSkill);

  const expected = resolutionChainOf(modelSpec);

  assert.strictEqual(sut, expected);
});

test('Given the Model resolution & fallback bullet of skills/run/SKILL.md, when it is read, then it names MODEL-RETRY( and MODEL-DEGRADED( and says an overload is retried ONCE on the same tier', () => {
  const sut = invariantBullet();

  for (const token of MODEL_TOKENS) {
    assert.ok(sut.includes(token), `${token} missing from the invariant bullet`);
  }
  assert.ok(sut.includes(SAME_TIER_RETRY_PHRASE));
});

test('Given skills/run/SKILL.md, when it is read, then it no longer says a bare model down/overloaded/unknown error degrades the tier', () => {
  const sut = runSkill;

  assert.ok(!sut.includes(RETIRED_SKILL_PHRASE));
});

test('Given step 9 of the skills/run/SKILL.md phase walk, when it is read, then it names MODEL-RETRY and MODEL-DEGRADED', () => {
  const sut = sliceRegion(
    runSkill,
    /^9\. \*\*On model-down\*\*/,
    /^`design` and `review` are already concern-named/
  );

  assert.ok(sut.includes('MODEL-RETRY'));
  assert.ok(sut.includes('MODEL-DEGRADED'));
});

test("Given the run skill's Run-record tokens list and the run-record spec's family list, when each is read, then each names MODEL-RETRY( and MODEL-DEGRADED(", () => {
  const sut = [
    ['skills/run/SKILL.md', sliceRegion(runSkill, /^### Run-record tokens/, /^\| Token \| Emitted by \|/)],
    [
      'docs/contributing/specs/run-record.md',
      sliceRegion(runRecordSpec, /^## Token vocabulary/, /^\| Token \| Regex over/),
    ],
  ];

  for (const [file, region] of sut) {
    for (const token of MODEL_TOKENS) {
      assert.ok(region.includes(token), `${file} token list is missing ${token}`);
    }
  }
});

test('Given the Core policy retained section of docs/contributing/specs/model.md, when it is read, then it carries a Transient-overload retry bullet', () => {
  const sut = sliceRegion(modelSpec, /^## Core policy retained/, /^## Binding set/);

  assert.ok(sut.includes(TRANSIENT_RETRY_BULLET));
});

test('Given docs/contributing/specs/model.md, when it is normalised, then none of the retired degrade-at-once phrases remain', () => {
  const sut = normaliseWhitespace(modelSpec);

  for (const phrase of RETIRED_MODEL_SPEC_PHRASES) {
    assert.ok(!sut.includes(phrase), phrase);
  }
});
