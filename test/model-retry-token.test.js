'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { normaliseWhitespace, sliceProse } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const RUN_SKILL_PATH = path.join(ROOT, 'skills', 'run', 'SKILL.md');
const MODEL_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs', 'model.md');
const RUN_RECORD_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md');

const RETRY_TOKEN = 'MODEL-RETRY(<role>):';
const DEGRADED_TOKEN = 'MODEL-DEGRADED(<tier>):';
const MODEL_TOKENS = [RETRY_TOKEN, DEGRADED_TOKEN];
const RETRY_TOKEN_NAME = 'MODEL-RETRY';
const DEGRADED_TOKEN_NAME = 'MODEL-DEGRADED';
const OVERLOAD_STATUS = '`529`';
const OVERLOAD_ERROR_TYPE = '`overloaded_error`';
const SAME_TIER_PHRASE = 'once on the same tier';
const SECOND_OVERLOAD_PHRASE = 'an overload on that retry';
const STEP_NINE_SECOND_OVERLOAD_PHRASE = 'second overload of that spawn';
const PERMANENT_WINS_PHRASE = 'the permanent class wins';
const IMMEDIATE_SAME_TIER_PHRASE = 'once on the same tier, immediately';
const PER_SPAWN_PHRASE = 'allowance is per spawn';
const DEGRADED_SKIP_PHRASE = 'later spawns and retries skip straight to the fallback';
const IN_FLIGHT_PHRASE = 'a retry already in flight finishes on its tier';
const BARE_SUBSTRING_GUARD_PHRASE = 'never a bare substring';
const RETIRED_SKILL_PHRASE = '(model down/overloaded/unknown';
const RETIRED_MODEL_SPEC_PHRASES = [
  'a model-availability error marks the tier degraded',
  'the model is down, overloaded, or returns an availability error',
  'it triggers core fallback re-resolution',
  'error triggers core fallback re-resolution',
  'model-down triggers core fallback re-resolution',
  'which core handles via fallback re-resolution',
  'an absent id marks the tier degraded',
];
const RULE_PHRASES = [
  IMMEDIATE_SAME_TIER_PHRASE,
  PERMANENT_WINS_PHRASE,
  PER_SPAWN_PHRASE,
  DEGRADED_SKIP_PHRASE,
  IN_FLIGHT_PHRASE,
];
const CHAIN_START = "→ the descriptor's `model:` field";
const CHAIN_END = '→ session model';

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
  sliceProse(runSkill, /^- \*\*Model resolution & fallback\*\*/, /^- \*\*Blockers\*\*/);
const transientRetryBullet = () =>
  sliceProse(modelSpec, /^- \*\*Transient-overload retry\*\*/, /^- \*\*Degraded-tier memory\*\*/);

// Prose phrases match case-insensitively so a sentence may open with one;
// fixed tokens and API literals are greppable, so their case is pinned exactly.
function assertIncludesEvery(text, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(text.toLowerCase().includes(phrase.toLowerCase()), `${label} is missing "${phrase}"`);
  }
}

function assertIncludesExactly(text, literals, label) {
  for (const literal of literals) {
    assert.ok(text.includes(literal), `${label} is missing "${literal}"`);
  }
}

test("Given skills/run/SKILL.md and docs/contributing/specs/model.md, when the resolution chain from the descriptor's model field to the session model is normalised, then both files state it identically", () => {
  const sut = resolutionChainOf(runSkill);

  const expected = resolutionChainOf(modelSpec);

  assert.strictEqual(sut, expected);
});

test('Given the Model resolution & fallback bullet of skills/run/SKILL.md, when it is read, then it names both full tokens and both overload markers', () => {
  const sut = invariantBullet();

  assertIncludesExactly(sut, [...MODEL_TOKENS, OVERLOAD_STATUS, OVERLOAD_ERROR_TYPE], 'the invariant bullet');
});

test('Given the Model resolution & fallback bullet of skills/run/SKILL.md, when it is read, then it states the same-tier retry, the tie-break, the no-wait, the per-spawn allowance and the degraded skip', () => {
  const sut = invariantBullet();

  assertIncludesEvery(sut, RULE_PHRASES, 'the invariant bullet');
});

test('Given the Model resolution & fallback bullet of skills/run/SKILL.md, when it is read, then an overload on the retry degrades the tier', () => {
  const sut = invariantBullet();

  assertIncludesEvery(sut, [SECOND_OVERLOAD_PHRASE], 'the invariant bullet');
});

test('Given the Model resolution & fallback bullet of skills/run/SKILL.md, when it is read, then it limits the 529 marker to a status or error code', () => {
  const sut = invariantBullet();

  assertIncludesEvery(sut, [BARE_SUBSTRING_GUARD_PHRASE], 'the invariant bullet');
});

test('Given skills/run/SKILL.md, when it is read, then it no longer says a bare model down/overloaded/unknown error degrades the tier', () => {
  const sut = normaliseWhitespace(runSkill);

  assert.ok(!sut.includes(RETIRED_SKILL_PHRASE));
});

test('Given step 9 of the skills/run/SKILL.md phase walk, when it is read, then it names both tokens, the same-tier retry and the per-spawn second overload', () => {
  const sut = sliceProse(
    runSkill,
    /^9\. \*\*On model-down\*\*/,
    /^`design` and `review` are already concern-named/
  );

  assertIncludesExactly(sut, [RETRY_TOKEN_NAME, DEGRADED_TOKEN_NAME], 'step 9');
  assertIncludesEvery(sut, [SAME_TIER_PHRASE, STEP_NINE_SECOND_OVERLOAD_PHRASE], 'step 9');
});

test("Given the run skill's Run-record tokens list and the run-record spec's family list, when each is read, then each names both full tokens", () => {
  const sut = [
    ['skills/run/SKILL.md', sliceProse(runSkill, /^### Run-record tokens/, /^\| Token \| Emitted by \|/)],
    [
      'docs/contributing/specs/run-record.md',
      sliceProse(runRecordSpec, /^## Token vocabulary/, /^\| Token \| Regex over/),
    ],
  ];

  for (const [file, region] of sut) {
    assertIncludesExactly(region, MODEL_TOKENS, `${file} token list`);
  }
});

test('Given the Transient-overload retry bullet of docs/contributing/specs/model.md, when it is read, then it states the same rule as the run skill invariant', () => {
  const sut = transientRetryBullet();

  assertIncludesEvery(sut, RULE_PHRASES, 'the model.md Transient-overload retry bullet');
});

test('Given docs/contributing/specs/model.md, when it is normalised, then none of the retired degrade-at-once phrases remain', () => {
  const sut = normaliseWhitespace(modelSpec);

  for (const phrase of RETIRED_MODEL_SPEC_PHRASES) {
    assert.ok(!sut.includes(phrase), phrase);
  }
});
