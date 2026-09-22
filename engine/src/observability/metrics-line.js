/**
 * Pure per-phase metrics ledger row formatter.
 *
 * No I/O, no clock, no `process`: turns one phase's slice of UsageEvents into
 * one append-only ledger row string.
 *
 * The cache split is rendered through an INJECTED function rather than an
 * imported one — this module sits under engine/src/observability/ and is not
 * a declared composition root, so R3 in test/architecture-boundaries.test.js
 * forbids it from importing adapters/claude/metrics-split.js directly. The
 * composition root supplies the closure that finally wires formatCacheSplit
 * in; this module imports nothing.
 *
 * The `equiv` weights are fixed named constants, never derived from a price
 * table: rows are compared to each other across an append-only ledger, and a
 * price-varying weight would break that comparability the moment prices changed.
 *
 * `duration_ms` sums AGENT time, never wall clock — the port parks each
 * transcript's span on that spawn's last event, so summing durationMs across
 * a slice adds per-spawn spans rather than double-counting overlapping time.
 */

const NA = 'na';

export const EQUIV_WEIGHT_INPUT = 1;
export const EQUIV_WEIGHT_CACHE_READ = 0.1;
export const EQUIV_WEIGHT_CACHE_CREATION = 1.25;
export const EQUIV_WEIGHT_OUTPUT = 5;

export const LEDGER_HEADER =
  '# craft per-phase metrics (append-only)\n'
  + "# duration_ms is summed AGENT time across a phase's spawns, never wall clock. "
  + 'equiv is a relative unit: input + 0.1*cache_read + 1.25*cache_creation + 5*output.\n';

function sumBy(events, selector) {
  return events.reduce((total, event) => total + selector(event), 0);
}

// The claude binding always supplies both cache keys; a vendor-neutral event
// from another binding may carry neither. Absent on any event in the slice
// means the split cannot be summed honestly, so the whole slice degrades.
function hasCacheSplit(events) {
  return events.every(({ tokens }) => Object.hasOwn(tokens, 'cacheRead') && Object.hasOwn(tokens, 'cacheCreation'));
}

function buildNumericFields(events) {
  return {
    turns: events.length,
    // toolCalls is optional on the port's event shape — only the claude
    // binding populates it. A binding that omits it measures zero tool
    // calls, which is a real measurement; without the coalesce the whole
    // row renders NaN into an append-only artifact.
    toolCalls: sumBy(events, e => e.toolCalls ?? 0),
    durationMs: sumBy(events, e => e.durationMs),
    output: sumBy(events, e => e.tokens.output),
    inputSum: sumBy(events, e => e.tokens.input),
  };
}

function buildCacheSums(events) {
  return {
    cacheRead: sumBy(events, e => e.tokens.cacheRead),
    cacheCreation: sumBy(events, e => e.tokens.cacheCreation),
  };
}

// tokens/avg_ctx/equiv all derive from the input+cache+output context, so
// they cascade to `na` together the moment the cache split is unavailable —
// never emitted as 0, which would misrepresent an unknown as a measurement.
function buildDerivedTotals(numeric, cacheSums) {
  const context = numeric.inputSum + cacheSums.cacheRead + cacheSums.cacheCreation;
  return {
    tokens: context + numeric.output,
    avgCtx: Math.round(context / numeric.turns),
    equiv: Math.round(
      // equivalent mutant (* -> /): EQUIV_WEIGHT_INPUT is the fixed constant 1, and
      // x*1 === x/1 for every finite x, so the operator choice here is unobservable.
      numeric.inputSum * EQUIV_WEIGHT_INPUT
      + cacheSums.cacheRead * EQUIV_WEIGHT_CACHE_READ
      + cacheSums.cacheCreation * EQUIV_WEIGHT_CACHE_CREATION
      + numeric.output * EQUIV_WEIGHT_OUTPUT
    ),
  };
}

// The row's field order and separator, in one flat literal. It stays inline
// rather than behind a helper: this list IS what a reader opens the function
// to see, and the ledger is append-only, so the order is a compatibility
// surface rather than an implementation detail.
function rowFields(runId, phaseId, numeric, derived, cacheFragment) {
  return [
    runId, phaseId,
    `turns=${numeric.turns}`,
    `tool_calls=${numeric.toolCalls}`,
    `tokens=${derived.tokens}`,
    `duration_ms=${numeric.durationMs}`,
    cacheFragment,
    `output=${numeric.output}`,
    `avg_ctx=${derived.avgCtx}`,
    `equiv=${derived.equiv}`,
  ];
}

/**
 * @param {string} runId
 * @param {string} phaseId
 * @param {object[]} events - one phase's slice of UsageEvents
 * @param {(sums: {cacheRead: number, cacheCreation: number} | null) => string} renderCacheSplit
 * @returns {string} one ledger row
 */
export function formatMetricsRow(runId, phaseId, events, renderCacheSplit) {
  if (events.length === 0) return `${runId} ${phaseId} transcript=na`;

  const splitPresent = hasCacheSplit(events);
  const numeric = buildNumericFields(events);
  const cacheSums = splitPresent ? buildCacheSums(events) : null;
  const cacheFragment = renderCacheSplit(cacheSums);
  const derived = splitPresent ? buildDerivedTotals(numeric, cacheSums) : { tokens: NA, avgCtx: NA, equiv: NA };

  return rowFields(runId, phaseId, numeric, derived, cacheFragment).join(' ');
}
