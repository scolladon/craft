'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'contributing', 'metrics-baseline.report.json');
const RETIRED_REVIEW_WASTE_DETAIL = 'role reviewer has 6 review cycles';
const BELOW_THRESHOLD_RUN = '2ccfd2aa-a0d5-479b-bbf0-b3750ad53982';
const DISAGREEMENT_MESSAGE =
  'docs/contributing/metrics-baseline.report.json recommendations disagree with a replay of its own runs ' +
  'through the current rules; regenerate them with the command in docs/contributing/specs/telemetry.md ' +
  '§ "Committed baseline replay"';

function importReplay() {
  return import(pathToFileURL(path.join(ROOT, 'engine/src/observability/usage-aggregate.js')).href)
    .then(aggregateModule => aggregateModule.replayRecommendations);
}

function readCommittedReport() {
  return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
}

test('Given the committed metrics baseline, when its recommendations are replayed through the current rules, then the replay equals them', async () => {
  const sut = await importReplay();
  const report = readCommittedReport();

  const result = sut(report);

  assert.deepStrictEqual(result, report.recommendations, DISAGREEMENT_MESSAGE);
});

test('Given the committed metrics baseline with one review-waste detail reverted to the retired shape, when replayed, then the replay disagrees', async () => {
  const sut = await importReplay();
  const report = readCommittedReport();
  report.recommendations.find(rec => rec.kind === 'review-waste').detail = RETIRED_REVIEW_WASTE_DETAIL;

  const result = sut(report);

  assert.notDeepStrictEqual(result, report.recommendations);
});

test('Given the committed metrics baseline plus a review-waste rec for a cycle under the billed-turn threshold, when replayed, then the replay disagrees', async () => {
  const sut = await importReplay();
  const report = readCommittedReport();
  const [cycle] = report.runs.find(run => run.run === BELOW_THRESHOLD_RUN).reviewCycles;
  report.recommendations.push({
    kind: 'review-waste', run: BELOW_THRESHOLD_RUN, phase: 'review', model: null,
    detail: `role ${cycle.role} billed ${cycle.billedTurns} turns across review`,
    evidence: {
      role: cycle.role, cycles: cycle.cycles, billedTurns: cycle.billedTurns,
      totalCost: cycle.totalCost, maxCost: cycle.maxCost, meanCost: cycle.meanCost,
    },
  });

  const result = sut(report);

  assert.notDeepStrictEqual(result, report.recommendations);
});
