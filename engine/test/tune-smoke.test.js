/**
 * Acceptance smoke for the observe→tune→observe loop (design requirement 8):
 * mine run A → the miner flags reviewer on the expensive model with a model-routing
 * rec → planTune proposes models.reviewer = <cheaper> → apply the patch and mine the
 * applied world (run B, reviewer on the cheaper model) → the review phase's priced
 * cost dropped, and the drop matches the projection the rec promised. This is the
 * end-to-end proof that the tuner's patch moves the flagged phase's economics.
 * Given/When/Then title, Arrange-Act-Assert body, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../src/observability/usage-aggregate.js';
import { planTune } from '../src/tune-plan.js';

const PRICES = {
  expensive: { input: 10, cacheRead: 1, cacheCreation5m: 12, cacheCreation1h: 20, output: 50 },
  cheap: { input: 1, cacheRead: 0.1, cacheCreation5m: 1.2, cacheCreation1h: 2, output: 5 },
};

const REVIEW_TOKENS = { input: 100, cacheRead: 1000, cacheCreation: 200, output: 500 };

function reviewEvent(model, tokens) {
  return {
    run: 'run-1', slug: 'feature-x', phase: 'review', role: 'reviewer',
    model, tokens, cacheCreationTtl: null, messages: 5, durationMs: 1000,
  };
}

function reviewCost(report) {
  const group = report.runs
    .flatMap(run => run.groups)
    .find(g => g.phase === 'review' && g.role === 'reviewer');
  return group.cost.priced;
}

test('Given run A flags reviewer on the expensive model, when planTune proposes the cheaper route and run B applies it, then the review phase priced cost drops to the projected figure', () => {
  const sut = planTune;

  // Mine run A: the review phase ran the expensive model, with a cheaper model also
  // present — so the miner emits a model-routing rec for the reviewer role.
  const reportA = aggregate(
    [reviewEvent('expensive', REVIEW_TOKENS), reviewEvent('cheap', { input: 1, cacheRead: 1, cacheCreation: 1, output: 1 })],
    PRICES,
  );
  const rec = reportA.recommendations.find(r => r.kind === 'model-routing' && r.phase === 'review');
  assert.ok(rec, 'run A must flag a model-routing rec for review');

  // Tune: propose routing the reviewer role to the cheaper model.
  const { patchedFrontmatter } = sut({ report: reportA, baseFrontmatter: {} });
  assert.equal(patchedFrontmatter.models.reviewer, 'cheap');

  // Mine the applied world (run B): the same review work now runs the cheaper model.
  const reportB = aggregate([reviewEvent('cheap', REVIEW_TOKENS)], PRICES);

  // The loop closed: the flagged phase's economics moved, and by the promised amount.
  assert.ok(reviewCost(reportB) < rec.evidence.currentPricedCost, 'review cost must drop after applying the route');
  assert.equal(reviewCost(reportB), rec.evidence.projectedPricedCost, 'the drop must match the projection the rec promised');
});
