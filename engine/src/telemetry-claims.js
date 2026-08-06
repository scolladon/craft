/**
 * README drift-guard telemetry recompute — pure, deterministic aggregation
 * over an already-parsed metrics-baseline report object. No fs, no clock, no
 * randomness: callers own I/O and pass the parsed report in.
 */

const MS_PER_HOUR = 3_600_000;
const MINUTES_PER_HOUR = 60;
const HALF_HOUR = 0.5;
// Sub-half-hour minima are published to a five-minute granularity: finer reads as
// false precision on a figure that moves with every run.
const MINUTES_STEP = 5;

function round1(x) {
  return Math.round(x * 10) / 10;
}

function nearestHalf(x) {
  return Math.round(x * 2) / 2;
}

function roundInt(x) {
  return Math.round(x);
}

function runDurationMs(run) {
  return run.groups.reduce((total, group) => total + group.durationMs, 0);
}

function sortedAscending(values) {
  return [...values].sort((a, b) => a - b);
}

/** Even n: average of the two central order statistics. Odd n: the middle one. */
function median(sortedValues) {
  const middle = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
  }
  return sortedValues[middle];
}

/**
 * @param {{runs: Array<{groups: Array<{durationMs: number}>}>}} report
 * @returns {{runCount: number, medianHours: number, minHours: number, maxHours: number}}
 */
export function recomputeClaims(report) {
  const durationBearingHours = report.runs
    .map((run) => runDurationMs(run) / MS_PER_HOUR)
    .filter((hours) => hours > 0);
  if (durationBearingHours.length === 0) {
    throw new Error('no duration-bearing runs in report — median/min/max are undefined');
  }
  const sortedHours = sortedAscending(durationBearingHours);

  return {
    runCount: report.runs.length,
    medianHours: median(sortedHours),
    minHours: sortedHours[0],
    maxHours: sortedHours[sortedHours.length - 1],
  };
}

function findRunCountDrift(recomputed, costClaims) {
  const readmeValue = Number(costClaims.runCount);
  if (recomputed.runCount === readmeValue) return null;
  return `telemetry:runCount: readme=${readmeValue} recomputed=${recomputed.runCount}`;
}

function findMedianDrift(recomputed, costClaims) {
  const rounded = round1(recomputed.medianHours);
  if (rounded === Number(costClaims.median)) return null;
  return `telemetry:median: readme=${costClaims.median} recomputed=${rounded}`;
}

/**
 * Render the shortest run as the prose phrase the README is expected to carry.
 *
 * Sub-half-hour durations round UP to the next five minutes, so the published claim can
 * never understate how short the shortest run was. Above half an hour no phrasing
 * convention exists, so the caller reports drift with the recomputed number rather than
 * inventing wording the README was never written to match.
 *
 * @param {number} hours
 * @returns {string | null} the expected phrase, or null when no convention covers it
 */
function minLabel(hours) {
  if (nearestHalf(hours) === HALF_HOUR) return 'half an hour';
  if (hours >= HALF_HOUR) return null;
  const minutes = Math.ceil((hours * MINUTES_PER_HOUR) / MINUTES_STEP) * MINUTES_STEP;
  return `under ${minutes} minutes`;
}

function findMinDrift(recomputed, costClaims) {
  const expected = minLabel(recomputed.minHours);
  if (expected !== null && costClaims.min === expected) return null;
  const reported = expected ?? nearestHalf(recomputed.minHours);
  return `telemetry:min: readme=${costClaims.min} recomputed=${reported}`;
}

function findMaxDrift(recomputed, costClaims) {
  const rounded = roundInt(recomputed.maxHours);
  if (rounded === Number(costClaims.max)) return null;
  return `telemetry:max: readme=${costClaims.max} recomputed=${rounded}`;
}

/**
 * @param {{runCount: number, medianHours: number, minHours: number, maxHours: number}} recomputed
 * @param {{runCount: string, median: string, min: string, max: string}} costClaims
 * @returns {string[]} one finding per mismatched surface, empty when clean
 */
export function compareClaims(recomputed, costClaims) {
  return [
    findRunCountDrift(recomputed, costClaims),
    findMedianDrift(recomputed, costClaims),
    findMinDrift(recomputed, costClaims),
    findMaxDrift(recomputed, costClaims),
  ].filter((finding) => finding !== null);
}
