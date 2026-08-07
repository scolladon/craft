/**
 * Pure aggregate core: UsageEvent[] + priceTable → report.
 *
 * No clock, no random, no model-id literals, no runtime paths.
 * All time derives from event data; keys are sorted for byte-stable output.
 */

import { phaseSkipRecs } from './skip-signals.js';

export const CACHE_HOTSPOT_THRESHOLD = 0.5;
export const REVIEW_WASTE_CYCLES = 2;
export const DEFAULT_DRIFT_THRESHOLD = 0.25;

// Price tables are per-MTok (per million tokens); token counts are per-unit. One
// division converts a summed unit-rate product into dollars — applied once per
// emitted cost value, never folded into the price table itself (pricing.js keeps
// --prices overrides comparable to DEFAULT_PRICES only if both stay per-MTok).
const TOKENS_PER_MTOK = 1_000_000;

// ── Private: pure math helpers ────────────────────────────────────────────────

function toDollars(summedRateProduct) {
  return summedRateProduct / TOKENS_PER_MTOK;
}

// Numerically safe on malformed/older-schema groups: a missing tokens object or
// field contributes 0, never NaN (NaN would silently swallow drift entries).
function computeRelativeCost(tokens) {
  return (tokens?.input ?? 0) + (tokens?.cacheRead ?? 0) + (tokens?.cacheCreation ?? 0) + (tokens?.output ?? 0);
}

function computeCacheEfficiency(tokens) {
  const denom = tokens.cacheRead + tokens.cacheCreation;
  return denom === 0 ? 0 : tokens.cacheCreation / denom;
}

// Undivided by design: this composes into computePricedCost's single toDollars()
// call below, and is also called standalone at buildEnrichedGroup's own call site,
// which converts it there instead. Dividing here would double-convert the composed
// call while leaving the standalone call under-converted — the asymmetry is load-
// bearing, not an oversight.
function computePricedCreation(cacheCreationTtl, cacheCreation, prices) {
  if (cacheCreationTtl) {
    return cacheCreationTtl.creation5m * prices.cacheCreation5m
      + cacheCreationTtl.creation1h * prices.cacheCreation1h;
  }
  return cacheCreation * prices.cacheCreation5m;
}

function computePricedCost(tokens, cacheCreationTtl, prices) {
  const creation = computePricedCreation(cacheCreationTtl, tokens.cacheCreation, prices);
  // Convert the whole summed rate-product to dollars exactly once, at the sum —
  // never inside computePricedCreation or the price table — so every intermediate
  // term stays comparable and a --prices override rate is never scaled twice.
  return toDollars(
    tokens.input * prices.input
      + tokens.cacheRead * prices.cacheRead
      + creation
      + tokens.output * prices.output
  );
}

// model is a transcript-controlled string — a bare priceTable[model] access
// would resolve an inherited Object.prototype member (e.g. model: "constructor")
// to a truthy-but-wrong price entry and corrupt cost math with NaN. Object.hasOwn
// gates the lookup to the table's own keys only, mirroring the front door's
// existing SOURCES/DEFAULT_READ_ROOTS discipline.
function lookupPrices(priceTable, model) {
  return Object.hasOwn(priceTable, model) ? priceTable[model] : undefined;
}

function computeCost(tokens, cacheCreationTtl, model, priceTable) {
  const prices = lookupPrices(priceTable, model);
  const priced = prices ? computePricedCost(tokens, cacheCreationTtl, prices) : null;
  return { priced, relative: computeRelativeCost(tokens) };
}

// ── Private: group accumulation ───────────────────────────────────────────────

function buildGroupKey(g) {
  return `${g.phase}\x00${g.role ?? ''}\x00${g.model}`;
}

function initGroup(event) {
  return {
    phase: event.phase, role: event.role, model: event.model,
    tokens: { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 },
    messages: 0, durationMs: 0, cacheCreationTtl: null,
  };
}

function accumulateGroup(group, event) {
  group.tokens.input += event.tokens.input;
  group.tokens.cacheRead += event.tokens.cacheRead;
  group.tokens.cacheCreation += event.tokens.cacheCreation;
  group.tokens.output += event.tokens.output;
  group.messages += event.messages;
  group.durationMs += event.durationMs;
  if (!event.cacheCreationTtl) return;
  if (!group.cacheCreationTtl) group.cacheCreationTtl = { creation5m: 0, creation1h: 0 };
  group.cacheCreationTtl.creation5m += event.cacheCreationTtl.creation5m;
  group.cacheCreationTtl.creation1h += event.cacheCreationTtl.creation1h;
}

function buildGroupMap(events) {
  const byKey = new Map();
  for (const evt of events) {
    const key = buildGroupKey(evt);
    if (!byKey.has(key)) byKey.set(key, initGroup(evt));
    accumulateGroup(byKey.get(key), evt);
  }
  return byKey;
}

// ── Private: enriched group (carries internal fields for rec builders) ─────────

function buildEnrichedGroup(runId, raw, priceTable) {
  const prices = lookupPrices(priceTable, raw.model);
  const cost = computeCost(raw.tokens, raw.cacheCreationTtl, raw.model, priceTable);
  // The only emitter of computePricedCreation that does not compose inside
  // computePricedCost, so it must convert to dollars itself to match cost.priced's
  // unit (see the comment on computePricedCreation for why it stays undivided).
  const pricedCreationCost = prices
    ? toDollars(computePricedCreation(raw.cacheCreationTtl, raw.tokens.cacheCreation, prices))
    : null;
  return {
    run: runId, phase: raw.phase, role: raw.role, model: raw.model,
    messages: raw.messages, durationMs: raw.durationMs,
    tokens: { ...raw.tokens }, cacheCreationTtl: raw.cacheCreationTtl,
    cacheEfficiency: computeCacheEfficiency(raw.tokens),
    cost, pricedCreationCost,
  };
}

function toReportGroup(enriched) {
  return {
    cacheEfficiency: enriched.cacheEfficiency,
    cost: enriched.cost,
    durationMs: enriched.durationMs,
    messages: enriched.messages,
    model: enriched.model,
    phase: enriched.phase,
    role: enriched.role,
    tokens: enriched.tokens,
  };
}

// ── Private: review cycles ────────────────────────────────────────────────────

// aggregates one cost dimension (all-priced or all-relative values) in
// isolation — the caller never mixes the two into one array. The moment any
// single value is null (an unpriced model among the role's cycles), the whole
// dimension aggregates to null: a partial sum would misrepresent the role's
// true cost, not merely omit a data point.
// `values` is one entry per billed turn, so it grows with corpus size — total
// and max are folded into this single reduce pass (never Math.max(...values),
// which would throw RangeError past ~120k spread arguments, and aggregate()
// sits outside any try/catch, which would turn an advisory exit-0 tool into a
// hard failure). `mean` in the caller derives from `total` rather than a
// second traversal.
function sumAndMax(values) {
  return values.reduce(
    // equivalent mutant (>=): a running max never differs by which branch a tie
    // takes — when v === acc.max both `v` and `acc.max` are the same value, so
    // `v >= acc.max ? v : acc.max` selects an equal number to `v > acc.max ? v :
    // acc.max`; the two operators only diverge exactly at that tie, where the
    // result is identical either way.
    (acc, v) => ({ total: acc.total + v, max: v > acc.max ? v : acc.max }),
    { total: 0, max: -Infinity }
  );
}

function aggregateCostDimension(values) {
  if (values.some(v => v == null)) return { total: null, max: null, mean: null };
  const { total, max } = sumAndMax(values);
  return { total, max, mean: total / values.length };
}

// A "cycle" is one sub-agent spawn, not one billed turn: a single reviewer
// sub-agent can emit many billed-turn events (one per assistant message.id),
// and counting those turns as cycles is exactly the defect this fixes. `evt.
// spawnId` is the opaque per-transcript ordinal the claude adapter stamps
// onto every event it emits from one parseLines() call — one call per
// sub-agent transcript, one transcript per spawn — so events sharing a
// spawnId collapse to the one cycle they actually came from. Events that
// carry no spawn identity at all (main-loop events, which never reach here
// since their phase is always null; or a source with no per-spawn transcript
// boundary) share the single `undefined` key and collapse together too —
// honest under-counting rather than assuming turn-count distinctness.
function distinctSpawnCount(evts) {
  return new Set(evts.map(e => e.spawnId)).size;
}

// O(1)-per-role aggregate evidence computed in the same single pass, so
// reviewCycles size stays proportional to distinct (run, role) pairs rather
// than to turn count. priced and relative stay in their own { priced, relative }
// shape at every level — mirroring the shape every group already carries —
// never collapsed together with `??`. `billedTurns` keeps the pre-fix
// per-turn count available (cost/schedule signal) alongside the corrected
// `cycles` (spawn-identity signal) rather than dropping it.
function buildReviewCycles(events, priceTable) {
  const byRole = new Map();
  for (const evt of events) {
    if (evt.phase !== 'review') continue;
    const role = evt.role ?? 'unknown';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(evt);
  }
  return [...byRole.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([role, evts]) => {
      const costs = evts.map(e => computeCost(e.tokens, e.cacheCreationTtl, e.model, priceTable));
      const priced = aggregateCostDimension(costs.map(c => c.priced));
      const relative = aggregateCostDimension(costs.map(c => c.relative));
      return {
        role,
        cycles: distinctSpawnCount(evts),
        billedTurns: evts.length,
        totalCost: { priced: priced.total, relative: relative.total },
        maxCost: { priced: priced.max, relative: relative.max },
        meanCost: { priced: priced.mean, relative: relative.mean },
      };
    });
}

// ── Private: run builder ──────────────────────────────────────────────────────

function buildRunData(runId, slug, events, priceTable) {
  const groupMap = buildGroupMap(events);
  const enriched = [...groupMap.values()]
    .map(raw => buildEnrichedGroup(runId, raw, priceTable))
    .sort((a, b) => buildGroupKey(a).localeCompare(buildGroupKey(b)));
  const groups = enriched.map(toReportGroup);
  const reviewCycles = buildReviewCycles(events, priceTable);
  return { run: { run: runId, slug, groups, reviewCycles }, enriched };
}

function groupByRun(events) {
  const byRun = new Map();
  for (const event of events) {
    if (!byRun.has(event.run)) byRun.set(event.run, { slug: null, events: [] });
    const r = byRun.get(event.run);
    if (event.slug != null && r.slug == null) r.slug = event.slug;
    r.events.push(event);
  }
  return byRun;
}

// ── Private: recommendation builders ─────────────────────────────────────────

function cacheHotspotRecs(enrichedGroups) {
  const runCost = new Map();
  for (const g of enrichedGroups) {
    runCost.set(g.run, (runCost.get(g.run) ?? 0) + (g.cost.priced ?? 0));
  }
  return enrichedGroups
    .filter(g => g.cacheEfficiency >= CACHE_HOTSPOT_THRESHOLD && g.pricedCreationCost != null)
    .map(g => ({
      kind: 'cache-hotspot', run: g.run, phase: g.phase, model: g.model,
      detail: `phase ${g.phase} has high cache-creation ratio`,
      evidence: {
        cacheCreation: g.tokens.cacheCreation,
        pricedCreationCost: g.pricedCreationCost,
        shareOfRunCost: runCost.get(g.run) > 0 ? g.pricedCreationCost / runCost.get(g.run) : 0,
      },
    }));
}

function buildRoutingRec(expensive, cheap, priceTable) {
  const cheapPrices = lookupPrices(priceTable, cheap.model);
  if (!cheapPrices) return null;
  const projected = computePricedCost(expensive.tokens, expensive.cacheCreationTtl, cheapPrices);
  if (projected >= expensive.cost.priced) return null;
  return {
    // role rides on the rec so a downstream tuner routes models.<role> without
    // re-deriving it from the run's groups.
    kind: 'model-routing', run: expensive.run, phase: expensive.phase, role: expensive.role, model: expensive.model,
    detail: `consider ${cheap.model} for phase ${expensive.phase}`,
    evidence: {
      currentModel: expensive.model, currentPricedCost: expensive.cost.priced,
      candidateModel: cheap.model, projectedPricedCost: projected,
    },
  };
}

function modelRoutingRecs(enrichedGroups, priceTable) {
  const byRunPhase = new Map();
  for (const g of enrichedGroups) {
    const key = `${g.run}\x00${g.phase}`;
    if (!byRunPhase.has(key)) byRunPhase.set(key, []);
    byRunPhase.get(key).push(g);
  }
  return [...byRunPhase.values()].flatMap(groups => {
    const priced = groups.filter(g => g.cost.priced != null);
    if (priced.length < 2) return [];
    const sorted = [...priced].sort((a, b) => b.cost.priced - a.cost.priced);
    const rec = buildRoutingRec(sorted[0], sorted[sorted.length - 1], priceTable);
    return rec ? [rec] : [];
  });
}

function reviewWasteRecs(runs) {
  return runs.flatMap(run =>
    run.reviewCycles
      .filter(rc => rc.cycles > REVIEW_WASTE_CYCLES)
      .map(rc => ({
        kind: 'review-waste', run: run.run, phase: 'review', model: null,
        detail: `role ${rc.role} has ${rc.cycles} review cycles`,
        evidence: {
          role: rc.role, cycles: rc.cycles, billedTurns: rc.billedTurns,
          totalCost: rc.totalCost, maxCost: rc.maxCost, meanCost: rc.meanCost,
        },
      }))
  );
}

function sortedRecs(recs) {
  return recs.sort((a, b) => {
    const ka = `${a.kind}\x00${a.run}\x00${a.phase}\x00${a.model ?? ''}`;
    const kb = `${b.kind}\x00${b.run}\x00${b.phase}\x00${b.model ?? ''}`;
    return ka.localeCompare(kb);
  });
}

// ── Private: baseline group matching (shared by baselineDeltas + drift) ───────

function buildRunGroupKey(runId, g) {
  return `${runId}\x00${g.phase}\x00${g.role ?? ''}\x00${g.model}`;
}

function buildBaselineGroupIndex(baselineReport) {
  const index = new Map();
  // equivalent mutant (OptionalChaining `?.` → `.`): baselineReport is only ever
  // reached here via aggregate()'s `if (baselineReport)` guard, so it is always
  // truthy at this call site — the `?.` never fires either way.
  for (const run of (baselineReport?.runs ?? [])) {
    for (const g of run.groups) {
      index.set(buildRunGroupKey(run.run, g), g);
    }
  }
  return index;
}

function matchedBaselineGroups(currentReport, baselineReport) {
  const baseIndex = buildBaselineGroupIndex(baselineReport);
  return currentReport.runs.flatMap(run =>
    run.groups.flatMap(g => {
      const base = baseIndex.get(buildRunGroupKey(run.run, g));
      return base ? [{ run: run.run, group: g, base }] : [];
    })
  );
}

// ── Private: baseline deltas ──────────────────────────────────────────────────

function computeBaselineDeltas(current, baseline) {
  return matchedBaselineGroups(current, baseline).map(({ run, group: g, base }) => {
    const pricedCostDelta = g.cost.priced != null && base.cost?.priced != null
      ? g.cost.priced - base.cost.priced : null;
    return {
      run, phase: g.phase, role: g.role, model: g.model,
      tokensDelta: Object.fromEntries(
        Object.keys(g.tokens).sort().map(k => [k, g.tokens[k] - (base.tokens?.[k] ?? 0)])
      ),
      pricedCostDelta,
      cacheEfficiencyDelta: g.cacheEfficiency - (base.cacheEfficiency ?? 0),
    };
  });
}

// ── Private: drift (advisory prompt-regression signal) ────────────────────────

const DRIFT_DIMENSIONS = ['tokens-total', 'durationMs'];
const EMPTY_PHASE_TOTALS = Object.freeze({ 'tokens-total': 0, durationMs: 0 });

// Drift compares phases ACROSS sessions, so aggregates are keyed by phase alone —
// run ids never coincide between a committed baseline and a fresh mining run.
// Values are MEANS per group occurrence, not sums: the miner re-mines an
// accumulating corpus, so sums grow with corpus size while means stay
// comparable and expose per-occurrence cost shifts.
function phaseMeans(report) {
  const acc = new Map();
  for (const run of report.runs ?? []) {
    for (const g of run.groups) {
      const a = acc.get(g.phase) ?? { tokens: 0, duration: 0, count: 0 };
      // equivalent mutant (AssignmentOperator `+=` → `-=`, all three lines below):
      // phaseMeans() runs identically over baselineReport and currentReport, and the
      // accumulated tokens/duration/count are only ever consumed as a ratio via
      // computeRelDelta(base, current) = (current-base)/base. Negating both operands
      // by the same factor leaves that ratio (and its `> threshold` / null-baseline
      // branching) unchanged — the raw sums are never otherwise exported or compared.
      a.tokens += computeRelativeCost(g.tokens);
      a.duration += g.durationMs ?? 0;
      a.count += 1;
      acc.set(g.phase, a);
    }
  }
  const means = new Map();
  for (const [phase, a] of acc) {
    means.set(phase, { 'tokens-total': a.tokens / a.count, durationMs: a.duration / a.count });
  }
  return means;
}

// null = activity with no baseline to relate to (base 0, current > 0);
// JSON-safe by construction, rendered as "new" downstream.
function computeRelDelta(baseValue, currentValue) {
  if (baseValue === 0) return currentValue === 0 ? 0 : null;
  return (currentValue - baseValue) / baseValue;
}

function buildDriftEntry(phase, dimension, baseValue, currentValue, threshold) {
  const delta = computeRelDelta(baseValue, currentValue);
  const flagged = delta === null || Math.abs(delta) > threshold;
  return flagged ? { phase, dimension, delta, threshold } : null;
}

function driftEntriesForPhase(phase, base, current, threshold) {
  return DRIFT_DIMENSIONS
    .map(dimension => buildDriftEntry(phase, dimension, base[dimension], current[dimension], threshold))
    .filter(Boolean);
}

function sortDrift(entries) {
  return entries.sort((a, b) => {
    const ka = `${a.phase}\x00${a.dimension}`;
    const kb = `${b.phase}\x00${b.dimension}`;
    return ka.localeCompare(kb);
  });
}

/**
 * Pure advisory drift signal: flags (phase, dimension) pairs whose per-phase
 * MEAN per group occurrence moved by more than `threshold` relative to the
 * baseline's mean — corpus-size-invariant, so re-mining a grown transcript
 * corpus does not read as drift. Phases are compared by name across sessions —
 * never by run id, which a committed baseline cannot share with a fresh run.
 * `delta` is null for a phase with activity but no baseline (rendered "new");
 * a phase that disappeared yields delta -1. Never a gate — an absent baseline
 * simply yields no flags.
 *
 * @param {object} currentReport
 * @param {object | null | undefined} baselineReport
 * @param {number} [threshold]
 * @returns {{ phase: string, dimension: string, delta: number | null, threshold: number }[]}
 */
export function computeDrift(currentReport, baselineReport, threshold = DEFAULT_DRIFT_THRESHOLD) {
  if (!baselineReport) return [];
  const base = phaseMeans(baselineReport);
  const current = phaseMeans(currentReport);
  const phases = [...new Set([...base.keys(), ...current.keys()])];
  const entries = phases.flatMap(phase => driftEntriesForPhase(
    phase,
    base.get(phase) ?? EMPTY_PHASE_TOTALS,
    current.get(phase) ?? EMPTY_PHASE_TOTALS,
    threshold
  ));
  return sortDrift(entries);
}

// ── Private: serialization ────────────────────────────────────────────────────

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortDeep(value[k])]));
  }
  return value;
}

// ── Public exports ────────────────────────────────────────────────────────────

export function aggregate(events, priceTable, baselineReport, threshold = DEFAULT_DRIFT_THRESHOLD, skipMarkers = []) {
  if (!events.length) return { schemaVersion: 1, runs: [], note: 'no events provided' };

  const byRun = groupByRun(events);
  const allEnriched = [];
  const runs = [];
  // C5: explicit loop instead of map-with-side-effects (CQS).
  for (const [runId, { slug, events: runEvents }] of [...byRun.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const { run, enriched } = buildRunData(runId, slug, runEvents, priceTable);
    runs.push(run);
    allEnriched.push(...enriched);
  }

  const recommendations = sortedRecs([
    ...cacheHotspotRecs(allEnriched),
    ...modelRoutingRecs(allEnriched, priceTable),
    ...reviewWasteRecs(runs),
    ...phaseSkipRecs(skipMarkers),
  ]);

  const report = { schemaVersion: 1, runs, recommendations };
  if (baselineReport) {
    report.baselineDeltas = computeBaselineDeltas(report, baselineReport);
    report.drift = computeDrift(report, baselineReport, threshold);
  }
  return report;
}

export function serializeReport(report) {
  return JSON.stringify(sortDeep(report), null, 2) + '\n';
}

export function renderMarkdown(report) {
  if (!report.runs?.length) {
    return `# Usage Report\n\n_No data: ${report.note ?? 'empty'}_\n`;
  }
  const lines = ['# Usage Report'];
  for (const run of report.runs) {
    lines.push(`\n## Run: ${run.run}${run.slug ? ` (${run.slug})` : ''}`);
    for (const g of run.groups) {
      const costStr = g.cost.priced != null
        ? `$${g.cost.priced.toFixed(4)}` : `${g.cost.relative} rel`;
      lines.push(`- **${g.phase}/${g.role ?? 'n/a'}** [${g.model}]: tokens=${JSON.stringify(g.tokens)} cacheEff=${g.cacheEfficiency.toFixed(3)} cost=${costStr}`);
    }
  }
  if (report.recommendations?.length) {
    lines.push('\n## Recommendations');
    for (const rec of report.recommendations) {
      lines.push(`\n### ${rec.kind} (${rec.phase}/${rec.model ?? 'n/a'})`);
      lines.push(rec.detail);
      lines.push(`evidence: ${JSON.stringify(rec.evidence)}`);
    }
  }
  if (report.drift?.length) {
    lines.push('\n## Phases drifted since baseline');
    for (const d of report.drift) {
      const deltaLabel = d.delta === null ? 'new (no baseline activity)' : d.delta.toFixed(3);
      lines.push(`- **${d.phase}** [${d.dimension}]: delta=${deltaLabel} (threshold=${d.threshold})`);
    }
  }
  return lines.join('\n') + '\n';
}
