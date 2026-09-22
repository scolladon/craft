import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatMetricsRow,
  LEDGER_HEADER,
  EQUIV_WEIGHT_INPUT,
  EQUIV_WEIGHT_CACHE_READ,
  EQUIV_WEIGHT_CACHE_CREATION,
  EQUIV_WEIGHT_OUTPUT,
} from '../src/observability/metrics-line.js';

// Shared fixtures — the vector and its expected row are pinned by the plan,
// so both the exact-row tests and the na-invariant table reuse them.

function buildEvent({ input = 0, cacheRead = 0, cacheCreation = 0, output = 0, toolCalls = 0, durationMs = 0 } = {}) {
  return { tokens: { input, cacheRead, cacheCreation, output }, toolCalls, durationMs };
}

function pinnedVectorEvents() {
  // One event carries the whole duration and the rest of the sums, the other
  // 27 are zero — mirroring how the port parks a sub-agent's span on its last
  // emitted event rather than spreading it across every turn.
  return [
    buildEvent({ input: 56, cacheRead: 2_661_903, cacheCreation: 115_993, output: 30_596, toolCalls: 40, durationMs: 469_000 }),
    ...Array.from({ length: 27 }, () => buildEvent()),
  ];
}

function noCacheSplitEvents() {
  // A vendor-neutral event whose tokens object never grew cacheRead/cacheCreation
  // keys — the claude binding always supplies both, another binding may not.
  return [
    { tokens: { input: 10, output: 5 }, toolCalls: 2, durationMs: 100 },
    { tokens: { input: 20, output: 8 }, toolCalls: 3, durationMs: 0 },
  ];
}

function renderRawSplit(sums) {
  return `cache_read=${sums.cacheRead} cache_creation=${sums.cacheCreation}`;
}

function rejectRenderCall() {
  throw new Error('renderCacheSplit must not be called for this slice');
}

// ── 1. formatMetricsRow — full slice renders the pinned row ────────────────────

test('Given a full reviewer phase slice, when formatMetricsRow runs, then it renders the pinned row', () => {
  const events = pinnedVectorEvents();
  const sut = formatMetricsRow;

  const result = sut('run-x', 'review', events, renderRawSplit);

  assert.equal(
    result,
    'run-x review turns=28 tool_calls=40 tokens=2808548 duration_ms=469000 '
    + 'cache_read=2661903 cache_creation=115993 output=30596 avg_ctx=99213 equiv=564218'
  );
});

// ── 2. formatMetricsRow — empty slice degrades to transcript=na ────────────────

test('Given an empty slice, when formatMetricsRow runs, then it renders transcript=na and no other field', () => {
  const sut = formatMetricsRow;

  const result = sut('run-x', 'design', [], rejectRenderCall);

  assert.equal(result, 'run-x design transcript=na');
});

// ── 3. formatMetricsRow — slice without a cache split cascades to na ───────────

test('Given a slice whose events carry no cache split, when formatMetricsRow runs, then the injected renderer is called with null and cache, tokens, avg_ctx and equiv are all na while turns, tool_calls, duration_ms and output stay numeric', () => {
  const events = noCacheSplitEvents();
  let receivedArg = 'unset';
  const renderCacheSplit = (sums) => {
    receivedArg = sums;
    return 'cache=na';
  };
  const sut = formatMetricsRow;

  const result = sut('run-x', 'design', events, renderCacheSplit);

  assert.equal(receivedArg, null);
  assert.equal(
    result,
    'run-x design turns=2 tool_calls=5 tokens=na duration_ms=100 cache=na output=13 avg_ctx=na equiv=na'
  );
});

// ── 4. formatMetricsRow — a measured zero renders 0; an unavailable input renders na ─

test('Given a slice that genuinely measures zero tool calls, when formatMetricsRow runs, then tool_calls renders as 0 rather than na', () => {
  const sut = formatMetricsRow;
  const events = [buildEvent({ input: 5, cacheRead: 100, cacheCreation: 50, output: 20 })];

  const result = sut('run-x', 'design', events, renderRawSplit);

  assert.match(result, /\btool_calls=0\b/, `a measured zero is a measurement, not an unknown: ${result}`);
  assert.doesNotMatch(result, /tool_calls=na/, `${result}`);
});

test('Given a slice whose cache split is unavailable, when formatMetricsRow runs, then every field derived from it renders na', () => {
  const sut = formatMetricsRow;

  const result = sut('run-x', 'design', noCacheSplitEvents(), () => 'cache=na');

  for (const field of ['cache=na', 'tokens=na', 'avg_ctx=na', 'equiv=na']) {
    assert.ok(result.includes(field), `expected ${field} in "${result}"`);
  }
  assert.doesNotMatch(result, /NaN/, `an unavailable input must never reach the ledger as NaN: ${result}`);
});

test('Given an event whose binding omits toolCalls entirely, when formatMetricsRow runs, then tool_calls is 0 and no field is NaN', () => {
  const sut = formatMetricsRow;
  const events = [{ tokens: { input: 10, cacheRead: 1, cacheCreation: 2, output: 5 }, durationMs: 100 }];

  const result = sut('run-x', 'review', events, renderRawSplit);

  assert.match(result, /\btool_calls=0\b/, `${result}`);
  assert.doesNotMatch(result, /NaN/, `an optional field a binding omits must never render NaN: ${result}`);
});

test('Given a slice where only some events carry the cache split, when formatMetricsRow runs, then the whole slice degrades rather than summing a partial split', () => {
  const sut = formatMetricsRow;
  const mixed = [
    buildEvent({ input: 10, cacheRead: 100, cacheCreation: 50, output: 5, toolCalls: 1, durationMs: 10 }),
    { tokens: { input: 20, output: 16 }, toolCalls: 2, durationMs: 0 },
  ];

  const result = sut('run-x', 'design', mixed, () => 'cache=na');

  assert.ok(result.includes('cache=na'), `a partial split cannot be summed honestly: ${result}`);
  assert.doesNotMatch(result, /NaN/, `${result}`);
  assert.match(result, /\bturns=2\b/, `the countable fields still measure: ${result}`);
});

test('Given an event carrying only ONE of the two cache keys, when formatMetricsRow runs, then the whole slice degrades rather than summing an undefined key as NaN', () => {
  const sut = formatMetricsRow;
  const oneKeyOnly = [
    buildEvent({ input: 10, cacheRead: 100, cacheCreation: 50, output: 5, toolCalls: 1, durationMs: 10 }),
    { tokens: { input: 20, cacheRead: 30, output: 16 }, toolCalls: 2, durationMs: 0 },
  ];

  const result = sut('run-x', 'design', oneKeyOnly, () => 'cache=na');

  assert.ok(result.includes('cache=na'), `a single-key event cannot be summed honestly: ${result}`);
  assert.doesNotMatch(result, /NaN/, `${result}`);
});

// ── 5. LEDGER_HEADER — names the duration unit and the equiv weights ───────────

test('Given a fresh ledger, when LEDGER_HEADER is read, then it names the duration unit and the equiv weights', () => {
  const sut = LEDGER_HEADER;

  assert.match(sut, /duration_ms is summed AGENT time/);
  assert.match(sut, /equiv is a relative unit: input \+ 0\.1\*cache_read \+ 1\.25\*cache_creation \+ 5\*output/);
});

test('Given a fresh ledger, when LEDGER_HEADER is read, then its first line marks the file as an append-only per-phase metrics ledger', () => {
  const sut = LEDGER_HEADER;

  assert.equal(sut.split('\n')[0], '# craft per-phase metrics (append-only)');
});

// ── 6. equiv weights are exported so another module can share the same unit ────

test('Given the exported equiv weights, when read, then they match the header\'s stated formula', () => {
  const formula = /equiv is a relative unit: input \+ ([\d.]+)\*cache_read \+ ([\d.]+)\*cache_creation \+ ([\d.]+)\*output/
    .exec(LEDGER_HEADER);
  const sut = { EQUIV_WEIGHT_INPUT, EQUIV_WEIGHT_CACHE_READ, EQUIV_WEIGHT_CACHE_CREATION, EQUIV_WEIGHT_OUTPUT };

  assert.ok(formula, 'the header states the equiv formula');
  assert.deepEqual(sut, {
    EQUIV_WEIGHT_INPUT: 1,
    EQUIV_WEIGHT_CACHE_READ: Number(formula[1]),
    EQUIV_WEIGHT_CACHE_CREATION: Number(formula[2]),
    EQUIV_WEIGHT_OUTPUT: Number(formula[3]),
  });
});
