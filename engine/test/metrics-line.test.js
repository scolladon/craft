import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatMetricsRow, LEDGER_HEADER } from '../src/observability/metrics-line.js';

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

// ── 4. formatMetricsRow — never renders 0 for an input the slice does not carry ─

test('Given any slice, when formatMetricsRow runs, then no field is ever the literal 0 for an input the slice does not carry', () => {
  const cases = [
    { runId: 'run-x', phaseId: 'review', events: pinnedVectorEvents(), renderCacheSplit: renderRawSplit },
    { runId: 'run-x', phaseId: 'design', events: [], renderCacheSplit: rejectRenderCall },
    { runId: 'run-x', phaseId: 'design', events: noCacheSplitEvents(), renderCacheSplit: () => 'cache=na' },
  ];
  const sut = formatMetricsRow;

  const results = cases.map(({ runId, phaseId, events, renderCacheSplit }) => sut(runId, phaseId, events, renderCacheSplit));

  for (const result of results) {
    assert.equal(result.includes('=0'), false, `expected no absent field to render as 0 in "${result}"`);
  }
});

// ── 5. LEDGER_HEADER — names the duration unit and the equiv weights ───────────

test('Given a fresh ledger, when LEDGER_HEADER is read, then it names the duration unit and the equiv weights', () => {
  const sut = LEDGER_HEADER;

  assert.match(sut, /duration_ms is summed AGENT time/);
  assert.match(sut, /equiv is a relative unit: input \+ 0\.1\*cache_read \+ 1\.25\*cache_creation \+ 5\*output/);
});
