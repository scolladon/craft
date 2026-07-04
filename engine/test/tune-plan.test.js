/**
 * In-process unit tests for the pure tuner core `planTune`: maps report.json
 * recommendations to manifest-knob proposals (model-routing → models.<role>,
 * phase-skip → pipeline.skip), surfaces the rest as advisory, and deep-merges the
 * auto-patches into a patched frontmatter without mutating the base.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTune } from '../src/tune-plan.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function routingReport() {
  return {
    schemaVersion: 1,
    runs: [{
      run: 'r1',
      slug: 's',
      groups: [
        { phase: 'review', role: 'reviewer', model: 'model-a', tokens: {}, cost: { priced: 100 }, cacheEfficiency: 0 },
        { phase: 'review', role: 'reviewer', model: 'model-b', tokens: {}, cost: { priced: 20 }, cacheEfficiency: 0 },
      ],
      reviewCycles: [],
    }],
    recommendations: [{
      kind: 'model-routing', run: 'r1', phase: 'review', role: 'reviewer', model: 'model-a',
      detail: 'consider model-b for phase review',
      evidence: { currentModel: 'model-a', currentPricedCost: 100, candidateModel: 'model-b', projectedPricedCost: 20 },
    }],
  };
}

function skipReport(runs) {
  return {
    schemaVersion: 1,
    runs: runs.map(r => ({ run: r, slug: 's', groups: [], reviewCycles: [] })),
    recommendations: runs.map(r => ({
      kind: 'phase-skip', run: r, phase: 'decisions', model: null,
      detail: 'phase decisions auto-skipped (evaluated unnecessary)', evidence: { marker: 'auto-skip' },
    })),
  };
}

const auto = (proposals) => proposals.filter(p => p.path !== null);
const advisory = (proposals) => proposals.filter(p => p.path === null);

// ── model-routing → models.<role> ─────────────────────────────────────────────

test('Given a model-routing rec, when planTune runs, then it proposes the full models.<role> proposal for the recovered role', () => {
  const sut = planTune;

  const { proposals, patchedFrontmatter } = sut({ report: routingReport(), baseFrontmatter: {} });

  const routing = auto(proposals).find(p => p.source === 'model-routing');
  assert.deepEqual(routing, {
    source: 'model-routing',
    path: ['models', 'reviewer'],
    from: null,
    to: 'model-b',
    rationale: 'route reviewer to model-b for phase review (saves ~80 priced)',
    evidence: { phase: 'review', savings: 80, currentModel: 'model-a', candidateModel: 'model-b' },
  });
  assert.equal(patchedFrontmatter.models.reviewer, 'model-b');
});

test('Given a base already routing another role, when planTune patches models, then it preserves the existing role and adds the new one', () => {
  const sut = planTune;

  const { patchedFrontmatter } = sut({ report: routingReport(), baseFrontmatter: { models: { planner: 'model-a' } } });

  assert.deepEqual(patchedFrontmatter.models, { planner: 'model-a', reviewer: 'model-b' });
});

test('Given a routing rec whose evidence lacks a candidate model, when planTune runs, then it proposes no routing', () => {
  const sut = planTune;
  const report = routingReport();
  report.recommendations[0].evidence = { currentModel: 'model-a', currentPricedCost: 100 };

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.equal(auto(proposals).length, 0);
});

test('Given a model-routing rec whose role is null, when planTune runs, then it proposes no routing', () => {
  const sut = planTune;
  const report = routingReport();
  report.recommendations[0].role = null;

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.equal(auto(proposals).length, 0);
});

test('Given a model-routing rec whose role is not a MODELS_KEYS agent, when planTune runs, then it proposes no routing', () => {
  const sut = planTune;
  const report = routingReport();
  report.recommendations[0].role = 'not-an-agent';

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.equal(auto(proposals).length, 0);
});

test('Given a base already routing the role to the candidate, when planTune runs, then it proposes no routing change', () => {
  const sut = planTune;

  const { proposals } = sut({ report: routingReport(), baseFrontmatter: { models: { reviewer: 'model-b' } } });

  assert.equal(auto(proposals).filter(p => p.source === 'model-routing').length, 0);
});

test('Given two routing recs for one role, when planTune runs, then it keeps the larger-saving proposal only', () => {
  const sut = planTune;
  const report = routingReport();
  report.runs.push({
    run: 'r2', slug: 's', groups: [
      { phase: 'review', role: 'reviewer', model: 'model-a', tokens: {}, cost: { priced: 100 }, cacheEfficiency: 0 },
      { phase: 'review', role: 'reviewer', model: 'model-b', tokens: {}, cost: { priced: 90 }, cacheEfficiency: 0 },
    ], reviewCycles: [],
  });
  report.recommendations.push({
    kind: 'model-routing', run: 'r2', phase: 'review', role: 'reviewer', model: 'model-a',
    detail: 'consider model-b for phase review',
    evidence: { currentModel: 'model-a', currentPricedCost: 100, candidateModel: 'model-b', projectedPricedCost: 90 },
  });

  const { proposals } = sut({ report, baseFrontmatter: {} });

  const routing = auto(proposals).filter(p => p.source === 'model-routing');
  assert.equal(routing.length, 1);
  assert.equal(routing[0].evidence.savings, 80);
});

// ── phase-skip → pipeline.skip ────────────────────────────────────────────────

test('Given a phase auto-skipped across two runs, when planTune runs, then it proposes adding it to pipeline.skip', () => {
  const sut = planTune;

  const { proposals, patchedFrontmatter } = sut({ report: skipReport(['r1', 'r2']), baseFrontmatter: {} });

  const skip = auto(proposals).find(p => p.source === 'phase-skip');
  assert.deepEqual(skip, {
    source: 'phase-skip',
    path: ['pipeline', 'skip'],
    from: null,
    to: 'decisions',
    rationale: 'drop decisions: auto-skipped in 2 runs (evaluated unnecessary)',
    evidence: { phase: 'decisions', runs: 2 },
  });
  assert.deepEqual(patchedFrontmatter.pipeline.skip, ['decisions']);
});

test('Given two phases each auto-skipped across runs, when planTune patches pipeline.skip, then both are merged sorted with any existing skip', () => {
  const sut = planTune;
  const report = skipReport(['r1', 'r2']);
  for (const run of ['r1', 'r2']) {
    report.recommendations.push({ kind: 'phase-skip', run, phase: 'refactoring', model: null, detail: 'x', evidence: { marker: 'auto-skip' } });
  }

  const { patchedFrontmatter } = sut({ report, baseFrontmatter: { pipeline: { skip: ['documentation'] } } });

  assert.deepEqual(patchedFrontmatter.pipeline.skip, ['decisions', 'documentation', 'refactoring']);
});

test('Given a phase-skip rec for a non-canonical phase name, when planTune runs, then it proposes no skip', () => {
  const sut = planTune;
  const report = skipReport(['r1', 'r2']);
  report.recommendations.forEach(rec => { rec.phase = 'not-a-phase'; });

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.equal(auto(proposals).filter(p => p.source === 'phase-skip').length, 0);
});

test('Given a phase auto-skipped in only one run, when planTune runs, then it proposes no skip', () => {
  const sut = planTune;

  const { proposals } = sut({ report: skipReport(['r1']), baseFrontmatter: {} });

  assert.equal(auto(proposals).filter(p => p.source === 'phase-skip').length, 0);
});

test('Given the base marks the phase required, when planTune runs, then it proposes no skip (would fail lint)', () => {
  const sut = planTune;

  const { proposals } = sut({ report: skipReport(['r1', 'r2']), baseFrontmatter: { phases: { decisions: { required: true } } } });

  assert.equal(auto(proposals).filter(p => p.source === 'phase-skip').length, 0);
});

test('Given the phase is already skipped in the base, when planTune runs, then it proposes no duplicate skip', () => {
  const sut = planTune;

  const { proposals } = sut({ report: skipReport(['r1', 'r2']), baseFrontmatter: { pipeline: { skip: ['decisions'] } } });

  assert.equal(auto(proposals).filter(p => p.source === 'phase-skip').length, 0);
});

// ── advisory surfacings (no knob) ─────────────────────────────────────────────

test('Given cache-hotspot, review-waste, and drift signals, when planTune runs, then each becomes an advisory proposal that patches nothing', () => {
  const sut = planTune;
  const report = {
    schemaVersion: 1,
    runs: [{ run: 'r1', slug: 's', groups: [], reviewCycles: [] }],
    recommendations: [
      { kind: 'cache-hotspot', run: 'r1', phase: 'implementation', model: 'model-a', detail: 'high cache', evidence: {} },
      { kind: 'review-waste', run: 'r1', phase: 'review', model: 'model-a', detail: 'many cycles', evidence: { role: 'reviewer', cycles: 4 } },
    ],
    drift: [{ phase: 'design', dimension: 'tokens-total', delta: 0.9, threshold: 0.25 }],
  };

  const { proposals, patchedFrontmatter } = sut({ report, baseFrontmatter: { a: 1 } });

  const bySource = Object.fromEntries(advisory(proposals).map(p => [p.source, p]));
  assert.deepEqual(Object.keys(bySource).sort(), ['cache-hotspot', 'drift', 'review-waste']);
  assert.deepEqual(bySource['cache-hotspot'], {
    source: 'cache-hotspot', path: null, from: null, to: null,
    rationale: 'phase implementation carries high cache-creation — consider a manual checkpoint', evidence: {},
  });
  assert.deepEqual(bySource['review-waste'], {
    source: 'review-waste', path: null, from: null, to: null,
    rationale: 'reviewer burned 4 review cycles — consider a cheaper reviewer tier', evidence: { role: 'reviewer', cycles: 4 },
  });
  assert.deepEqual(bySource['drift'], {
    source: 'drift', path: null, from: null, to: null,
    rationale: 'phase design drifted on tokens-total vs baseline — investigate the prompt',
    evidence: { phase: 'design', dimension: 'tokens-total', delta: 0.9, threshold: 0.25 },
  });
  assert.deepEqual(patchedFrontmatter, { a: 1 });
});

test('Given a review-waste rec missing its role and cycles, when planTune runs, then the advisory falls back to reviewer and a placeholder count', () => {
  const sut = planTune;
  const report = {
    schemaVersion: 1, runs: [],
    recommendations: [{ kind: 'review-waste', run: 'r1', phase: 'review', model: 'model-a', detail: 'x', evidence: {} }],
  };

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.equal(advisory(proposals)[0].rationale, 'reviewer burned ? review cycles — consider a cheaper reviewer tier');
});

test('Given recurring high-confidence memory findings, when planTune runs, then only they become advisory (low-confidence filtered)', () => {
  const sut = planTune;
  const memory = { entries: { findings: [
    { file: 'skills/x.md', pattern: 'recurring thing', confidence: 0.8 },
    { file: 'skills/y.md', pattern: 'weak signal', confidence: 0.5 },
  ] } };

  const { proposals } = sut({ report: { schemaVersion: 1, runs: [], recommendations: [] }, memory, baseFrontmatter: {} });

  const mem = advisory(proposals).filter(p => p.source === 'memory');
  assert.equal(mem.length, 1);
  assert.deepEqual(mem[0], {
    source: 'memory', path: null, from: null, to: null,
    rationale: 'recurring finding in skills/x.md: recurring thing — consider a context rule',
    evidence: { file: 'skills/x.md', pattern: 'recurring thing', confidence: 0.8 },
  });
});

test('Given a finding exactly at the confidence floor, when planTune runs, then it is included (boundary is inclusive)', () => {
  const sut = planTune;
  const memory = { entries: { findings: [{ file: 'skills/z.md', pattern: 'floor case', confidence: 0.7 }] } };

  const { proposals } = sut({ report: { schemaVersion: 1, runs: [], recommendations: [] }, memory, baseFrontmatter: {} });

  assert.equal(advisory(proposals).filter(p => p.source === 'memory').length, 1);
});

// ── purity / determinism / empty ──────────────────────────────────────────────

test('Given a base frontmatter, when planTune patches it, then the base object is not mutated', () => {
  const sut = planTune;
  const base = { models: { planner: 'model-a' } };

  sut({ report: routingReport(), baseFrontmatter: base });

  assert.deepEqual(base, { models: { planner: 'model-a' } });
});

test('Given an empty report, when planTune runs, then proposals is empty and the patch equals the base', () => {
  const sut = planTune;
  const base = { models: { planner: 'model-a' } };

  const { proposals, patchedFrontmatter } = sut({ report: { schemaVersion: 1, runs: [], recommendations: [] }, baseFrontmatter: base });

  assert.deepEqual(proposals, []);
  assert.deepEqual(patchedFrontmatter, base);
});

test('Given a report object missing its recommendations, runs, and drift keys, when planTune runs, then it returns no proposals without throwing', () => {
  const sut = planTune;

  const { proposals, patchedFrontmatter } = sut({ report: { schemaVersion: 1 }, baseFrontmatter: {} });

  assert.deepEqual(proposals, []);
  assert.deepEqual(patchedFrontmatter, {});
});

test('Given a routing rec whose evidence omits the priced costs, when planTune runs, then savings falls back to zero (no NaN)', () => {
  const sut = planTune;
  const report = routingReport();
  report.recommendations[0].evidence = { candidateModel: 'model-b' };

  const { proposals } = sut({ report, baseFrontmatter: {} });

  const routing = auto(proposals).find(p => p.source === 'model-routing');
  assert.equal(routing.evidence.savings, 0);
});

test('Given the same inputs, when planTune runs twice, then the proposal order is identical (deterministic)', () => {
  const sut = planTune;

  const a = sut({ report: skipReport(['r2', 'r1']), baseFrontmatter: {} }).proposals;
  const b = sut({ report: skipReport(['r1', 'r2']), baseFrontmatter: {} }).proposals;

  assert.deepEqual(a, b);
});

// ── mutation-hardening: defensive branches and sort discrimination ────────────

test('Given a routing rec with no evidence object, when planTune runs, then it proposes no routing without throwing', () => {
  const sut = planTune;
  const report = routingReport();
  delete report.recommendations[0].evidence;

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.equal(auto(proposals).length, 0);
});

test('Given two routing recs where the second has the larger saving, when planTune dedupes, then it keeps the second (larger) saving', () => {
  const sut = planTune;
  const report = routingReport();
  report.recommendations[0].evidence.projectedPricedCost = 90; // first saving = 10
  report.recommendations.push({
    kind: 'model-routing', run: 'r2', phase: 'review', role: 'reviewer', model: 'model-a',
    detail: 'x', evidence: { currentModel: 'model-a', currentPricedCost: 100, candidateModel: 'model-b', projectedPricedCost: 20 }, // second saving = 80
  });

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.equal(auto(proposals).find(p => p.source === 'model-routing').evidence.savings, 80);
});

test('Given a base phase block present but not required, when planTune runs, then the skip is still proposed', () => {
  const sut = planTune;

  const { proposals } = sut({ report: skipReport(['r1', 'r2']), baseFrontmatter: { phases: { decisions: { execution: 'inline' } } } });

  assert.equal(auto(proposals).filter(p => p.source === 'phase-skip').length, 1);
});

test('Given a base pipeline carrying another key, when planTune patches skip, then the other pipeline key is preserved', () => {
  const sut = planTune;

  const { patchedFrontmatter } = sut({ report: skipReport(['r1', 'r2']), baseFrontmatter: { pipeline: { profile: 'lean' } } });

  assert.equal(patchedFrontmatter.pipeline.profile, 'lean');
  assert.deepEqual(patchedFrontmatter.pipeline.skip, ['decisions']);
});

test('Given a memory view with no entries, when planTune runs, then it yields no memory advisory without throwing', () => {
  const sut = planTune;

  const { proposals } = sut({ report: { schemaVersion: 1, runs: [], recommendations: [] }, memory: {}, baseFrontmatter: {} });

  assert.equal(advisory(proposals).filter(p => p.source === 'memory').length, 0);
});

test('Given a review-waste rec with no evidence object, when planTune runs, then the advisory uses fallbacks without throwing', () => {
  const sut = planTune;
  const report = { schemaVersion: 1, runs: [], recommendations: [{ kind: 'review-waste', run: 'r1', phase: 'review', model: 'model-a', detail: 'x' }] };

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.equal(advisory(proposals)[0].rationale, 'reviewer burned ? review cycles — consider a cheaper reviewer tier');
});

test('Given proposals of several sources, when planTune sorts them, then they come out in ascending source order regardless of build order', () => {
  const sut = planTune;
  const report = {
    schemaVersion: 1,
    runs: [{ run: 'r1', slug: 's', groups: [], reviewCycles: [] }, { run: 'r2', slug: 's', groups: [], reviewCycles: [] }],
    recommendations: [
      { kind: 'model-routing', run: 'r1', phase: 'review', role: 'reviewer', model: 'model-a', detail: 'x', evidence: { currentModel: 'model-a', currentPricedCost: 100, candidateModel: 'model-b', projectedPricedCost: 20 } },
      { kind: 'phase-skip', run: 'r1', phase: 'decisions', model: null, detail: 'x', evidence: { marker: 'auto-skip' } },
      { kind: 'phase-skip', run: 'r2', phase: 'decisions', model: null, detail: 'x', evidence: { marker: 'auto-skip' } },
      { kind: 'cache-hotspot', run: 'r1', phase: 'implementation', model: 'model-a', detail: 'x', evidence: {} },
      { kind: 'review-waste', run: 'r1', phase: 'review', model: 'model-a', detail: 'x', evidence: { role: 'reviewer', cycles: 4 } },
    ],
  };

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.deepEqual(proposals.map(p => p.source), ['cache-hotspot', 'model-routing', 'phase-skip', 'review-waste']);
});

test('Given non-phase-skip recs for a phase across two runs, when planTune runs, then it proposes no pipeline.skip for that phase', () => {
  const sut = planTune;
  const report = {
    schemaVersion: 1,
    runs: [{ run: 'r1', slug: 's', groups: [], reviewCycles: [] }, { run: 'r2', slug: 's', groups: [], reviewCycles: [] }],
    recommendations: [
      { kind: 'cache-hotspot', run: 'r1', phase: 'review', model: 'model-a', detail: 'x', evidence: {} },
      { kind: 'cache-hotspot', run: 'r2', phase: 'review', model: 'model-a', detail: 'x', evidence: {} },
    ],
  };

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.equal(auto(proposals).filter(p => p.source === 'phase-skip').length, 0);
});

test('Given a base whose phases map lacks the skip-candidate block, when planTune runs, then the skip is still proposed without throwing', () => {
  const sut = planTune;

  const { proposals } = sut({ report: skipReport(['r1', 'r2']), baseFrontmatter: { phases: { documentation: { execution: 'inline' } } } });

  assert.equal(auto(proposals).filter(p => p.source === 'phase-skip').length, 1);
});

test('Given two phase-skip proposals built in reverse order, when planTune sorts them, then they come out ascending by phase name', () => {
  const sut = planTune;
  const report = {
    schemaVersion: 1,
    runs: [{ run: 'r1', slug: 's', groups: [], reviewCycles: [] }, { run: 'r2', slug: 's', groups: [], reviewCycles: [] }],
    recommendations: [
      { kind: 'phase-skip', run: 'r1', phase: 'refactoring', model: null, detail: 'x', evidence: { marker: 'auto-skip' } },
      { kind: 'phase-skip', run: 'r2', phase: 'refactoring', model: null, detail: 'x', evidence: { marker: 'auto-skip' } },
      { kind: 'phase-skip', run: 'r1', phase: 'decisions', model: null, detail: 'x', evidence: { marker: 'auto-skip' } },
      { kind: 'phase-skip', run: 'r2', phase: 'decisions', model: null, detail: 'x', evidence: { marker: 'auto-skip' } },
    ],
  };

  const { proposals } = sut({ report, baseFrontmatter: {} });

  assert.deepEqual(auto(proposals).filter(p => p.source === 'phase-skip').map(p => p.to), ['decisions', 'refactoring']);
});
