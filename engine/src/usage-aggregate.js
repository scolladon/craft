/**
 * Pure aggregate core: UsageEvent[] + priceTable → report.
 *
 * No clock, no random, no model-id literals, no runtime paths.
 * All time derives from event data; keys are sorted for byte-stable output.
 */

export const CACHE_HOTSPOT_THRESHOLD = 0.5;
export const REVIEW_WASTE_CYCLES = 2;

// ── Private: pure math helpers ────────────────────────────────────────────────

function computeRelativeCost(tokens) {
  return tokens.input + tokens.cacheRead + tokens.cacheCreation + tokens.output;
}

function computeCacheEfficiency(tokens) {
  const denom = tokens.cacheRead + tokens.cacheCreation;
  return denom === 0 ? 0 : tokens.cacheCreation / denom;
}

function computePricedCreation(cacheCreationTtl, cacheCreation, prices) {
  if (cacheCreationTtl) {
    return cacheCreationTtl.creation5m * prices.cacheCreation5m
      + cacheCreationTtl.creation1h * prices.cacheCreation1h;
  }
  return cacheCreation * prices.cacheCreation5m;
}

function computePricedCost(tokens, cacheCreationTtl, prices) {
  const creation = computePricedCreation(cacheCreationTtl, tokens.cacheCreation, prices);
  return tokens.input * prices.input
    + tokens.cacheRead * prices.cacheRead
    + creation
    + tokens.output * prices.output;
}

function computeCost(tokens, cacheCreationTtl, model, priceTable) {
  const prices = priceTable[model];
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
  const prices = priceTable[raw.model];
  const cost = computeCost(raw.tokens, raw.cacheCreationTtl, raw.model, priceTable);
  const pricedCreationCost = prices
    ? computePricedCreation(raw.cacheCreationTtl, raw.tokens.cacheCreation, prices)
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
    .map(([role, evts]) => ({
      role,
      cycles: evts.length,
      costPerCycle: evts.map(e =>
        computeCost(e.tokens, e.cacheCreationTtl, e.model, priceTable).priced
        ?? computeRelativeCost(e.tokens)
      ),
    }));
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
  const cheapPrices = priceTable[cheap.model];
  if (!cheapPrices) return null;
  const projected = computePricedCost(expensive.tokens, expensive.cacheCreationTtl, cheapPrices);
  if (projected >= expensive.cost.priced) return null;
  return {
    kind: 'model-routing', run: expensive.run, phase: expensive.phase, model: expensive.model,
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
        evidence: { role: rc.role, cycles: rc.cycles, costPerCycle: rc.costPerCycle },
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

// ── Private: baseline deltas ──────────────────────────────────────────────────

function computeBaselineDeltas(current, baseline) {
  const baseGroups = new Map();
  for (const run of (baseline.runs ?? [])) {
    for (const g of run.groups) {
      baseGroups.set(`${run.run}\x00${g.phase}\x00${g.role ?? ''}\x00${g.model}`, g);
    }
  }
  return current.runs.flatMap(run =>
    run.groups.flatMap(g => {
      const key = `${run.run}\x00${g.phase}\x00${g.role ?? ''}\x00${g.model}`;
      const base = baseGroups.get(key);
      if (!base) return [];
      const pricedCostDelta = g.cost.priced != null && base.cost?.priced != null
        ? g.cost.priced - base.cost.priced : null;
      return [{
        run: run.run, phase: g.phase, role: g.role, model: g.model,
        tokensDelta: Object.fromEntries(
          Object.keys(g.tokens).sort().map(k => [k, g.tokens[k] - (base.tokens?.[k] ?? 0)])
        ),
        pricedCostDelta,
        cacheEfficiencyDelta: g.cacheEfficiency - (base.cacheEfficiency ?? 0),
      }];
    })
  );
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

export function aggregate(events, priceTable, baselineReport) {
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
  ]);

  const report = { schemaVersion: 1, runs, recommendations };
  if (baselineReport) report.baselineDeltas = computeBaselineDeltas(report, baselineReport);
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
      // C2: divide by 1e6 for display — internal priced is Σ(tokens × $/MTok).
      const costStr = g.cost.priced != null
        ? `$${(g.cost.priced / 1e6).toFixed(4)}` : `${g.cost.relative} rel`;
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
  return lines.join('\n') + '\n';
}
