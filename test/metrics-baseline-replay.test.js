'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'contributing', 'metrics-baseline.report.json');
const RETIRED_REVIEW_WASTE_DETAIL = 'role reviewer has 6 review cycles';
// The disagreement cases plant their own run so they keep proving the guard can fail
// after a refresh replaces every run the committed report holds today.
const PLANTED_RUN = 'planted-run';
const NO_COST = { priced: 0, relative: 0 };
const DISAGREEMENT_MESSAGE =
  'docs/contributing/metrics-baseline.report.json recommendations disagree with a replay of its own runs ' +
  'through the current rules; regenerate them with the command in docs/contributing/specs/telemetry.md ' +
  '§ "Committed baseline replay"';

function importAggregateModule() {
  return import(pathToFileURL(path.join(ROOT, 'engine/src/observability/usage-aggregate.js')).href);
}

function readCommittedReport() {
  return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
}

function plantReviewWaste(report, billedTurns, detail) {
  const cycle = { role: 'reviewer', cycles: 1, billedTurns, totalCost: NO_COST, maxCost: NO_COST, meanCost: NO_COST };
  report.runs.push({ run: PLANTED_RUN, reviewCycles: [cycle] });
  report.recommendations.push({
    kind: 'review-waste', run: PLANTED_RUN, phase: 'review', model: null, detail, evidence: { ...cycle },
  });
}

test('Given the committed metrics baseline, when its recommendations are replayed through the current rules, then the replay equals them', async () => {
  const { replayRecommendations: sut } = await importAggregateModule();
  const report = readCommittedReport();

  const result = sut(report);

  assert.deepStrictEqual(result, report.recommendations, DISAGREEMENT_MESSAGE);
});

test('Given the committed metrics baseline plus a review-waste rec in the retired detail shape, when replayed, then the replay disagrees', async () => {
  const { replayRecommendations: sut, REVIEW_WASTE_BILLED_TURNS } = await importAggregateModule();
  const report = readCommittedReport();
  plantReviewWaste(report, REVIEW_WASTE_BILLED_TURNS + 1, RETIRED_REVIEW_WASTE_DETAIL);

  const result = sut(report);

  assert.notDeepStrictEqual(result, report.recommendations);
});

test('Given the committed metrics baseline plus a review-waste rec for a cycle at the billed-turn threshold, when replayed, then the replay disagrees', async () => {
  const { replayRecommendations: sut, REVIEW_WASTE_BILLED_TURNS } = await importAggregateModule();
  const report = readCommittedReport();
  plantReviewWaste(report, REVIEW_WASTE_BILLED_TURNS, `role reviewer billed ${REVIEW_WASTE_BILLED_TURNS} turns across review`);

  const result = sut(report);

  assert.notDeepStrictEqual(result, report.recommendations);
});
