import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recomputeClaims, compareClaims } from '../src/telemetry-claims.js';

const MS_PER_HOUR = 3_600_000;

function buildReport(runsHours) {
  return {
    runs: runsHours.map((hours, index) => ({
      run: index + 1,
      groups: [{ durationMs: hours * MS_PER_HOUR }],
    })),
  };
}

test('Given a report of 5 runs (2 of them zero-duration), when recomputeClaims, then runCount is 5', () => {
  const sut = recomputeClaims;
  const report = buildReport([1, 0, 2, 0, 3]);

  const result = sut(report);

  assert.equal(result.runCount, 5);
});

test('Given 4 duration-bearing runs with hours [1,2,3,4] (even n), when recomputeClaims, then medianHours is the average of the two central values', () => {
  const sut = recomputeClaims;
  const report = buildReport([1, 2, 3, 4]);

  const result = sut(report);

  assert.equal(result.medianHours, 2.5);
  assert.equal(result.minHours, 1);
  assert.equal(result.maxHours, 4);
});

test('Given 3 duration-bearing runs with hours [1,2,4] (odd n), when recomputeClaims, then medianHours is the middle value', () => {
  const sut = recomputeClaims;
  const report = buildReport([1, 2, 4]);

  const result = sut(report);

  assert.equal(result.medianHours, 2);
});

test('Given a report where one run sums to zero duration, when recomputeClaims, then that run is excluded from median/min/max but included in runCount', () => {
  const sut = recomputeClaims;
  const report = buildReport([0, 2, 4]);

  const result = sut(report);

  assert.equal(result.runCount, 3);
  assert.equal(result.medianHours, 3);
  assert.equal(result.minHours, 2);
  assert.equal(result.maxHours, 4);
});

test('Given recomputed raws that match the README tokens, when compareClaims, then no drift is found', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 27, medianHours: 1.2942, minHours: 0.4609, maxHours: 5.0083 };
  const costClaims = { runCount: '27', median: '1.3', min: 'half an hour', max: '5' };

  const result = sut(recomputed, costClaims);

  assert.deepEqual(result, []);
});

test('Given a recomputed median that rounds to 1.4 while the README claims 1.3, when compareClaims, then a telemetry:median finding names both values', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 27, medianHours: 1.35, minHours: 0.4609, maxHours: 5.0083 };
  const costClaims = { runCount: '27', median: '1.3', min: 'half an hour', max: '5' };

  const result = sut(recomputed, costClaims);

  const finding = result.find((line) => line.startsWith('telemetry:median'));
  assert.ok(finding, 'expected a telemetry:median finding');
  assert.match(finding, /1\.3/);
  assert.match(finding, /1\.4/);
});

test('Given a recomputed runCount that differs from the README claim, when compareClaims, then a telemetry:runCount finding names both values', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 28, medianHours: 1.2942, minHours: 0.4609, maxHours: 5.0083 };
  const costClaims = { runCount: '27', median: '1.3', min: 'half an hour', max: '5' };

  const result = sut(recomputed, costClaims);

  const finding = result.find((line) => line.startsWith('telemetry:runCount'));
  assert.ok(finding, 'expected a telemetry:runCount finding');
  assert.match(finding, /27/);
  assert.match(finding, /28/);
});

test('Given a recomputed maxHours that rounds to 6 while the README claims 5, when compareClaims, then a telemetry:max finding names both values', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 27, medianHours: 1.2942, minHours: 0.4609, maxHours: 5.6 };
  const costClaims = { runCount: '27', median: '1.3', min: 'half an hour', max: '5' };

  const result = sut(recomputed, costClaims);

  const finding = result.find((line) => line.startsWith('telemetry:max'));
  assert.ok(finding, 'expected a telemetry:max finding');
  assert.match(finding, /5/);
  assert.match(finding, /6/);
});

test('Given duration-bearing runs supplied out of order [4,1,3,2], when recomputeClaims, then min/median/max reflect ascending order, not input order', () => {
  const sut = recomputeClaims;
  const report = buildReport([4, 1, 3, 2]);

  const result = sut(report);

  assert.equal(result.minHours, 1);
  assert.equal(result.medianHours, 2.5);
  assert.equal(result.maxHours, 4);
});

test('Given a report with no duration-bearing run, when recomputeClaims, then it throws a descriptive error instead of yielding NaN', () => {
  const sut = recomputeClaims;
  const report = buildReport([0, 0]);

  assert.throws(() => sut(report), /no duration-bearing runs/);
});

test('Given a recomputed minHours that rounds to 1.0 instead of 0.5, when compareClaims, then a telemetry:min finding is produced', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 27, medianHours: 1.2942, minHours: 1.1, maxHours: 5.0083 };
  const costClaims = { runCount: '27', median: '1.3', min: 'half an hour', max: '5' };

  const result = sut(recomputed, costClaims);

  const finding = result.find((line) => line.startsWith('telemetry:min'));
  assert.ok(finding, 'expected a telemetry:min finding');
});

test('Given a shortest run under half an hour and a README claiming the matching rounded-up minutes, when compareClaims, then no telemetry:min finding is produced', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 25, medianHours: 1.4, minHours: 0.1535, maxHours: 4.02 };
  const costClaims = { runCount: '25', median: '1.4', min: 'under 10 minutes', max: '4' };

  const result = sut(recomputed, costClaims);

  assert.deepEqual(result, []);
});

test('Given a shortest run under half an hour, when compareClaims and the README rounds the minutes down instead of up, then a telemetry:min finding is produced', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 25, medianHours: 1.4, minHours: 0.1535, maxHours: 4.02 };
  const costClaims = { runCount: '25', median: '1.4', min: 'under 5 minutes', max: '4' };

  const result = sut(recomputed, costClaims);

  const finding = result.find((line) => line.startsWith('telemetry:min'));
  assert.ok(finding, 'expected a telemetry:min finding when the claim understates the minimum');
});

test('Given a recomputed minHours that rounds to 0.5 but the README claims different wording, when compareClaims, then a telemetry:min finding is still produced (both the number and the phrase must match)', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 27, medianHours: 1.2942, minHours: 0.4609, maxHours: 5.0083 };
  const costClaims = { runCount: '27', median: '1.3', min: 'twenty minutes', max: '5' };

  const result = sut(recomputed, costClaims);

  const finding = result.find((line) => line.startsWith('telemetry:min'));
  assert.ok(finding, 'expected a telemetry:min finding even though rounded minHours is 0.5');
});

test('Given a recomputed minHours at or above the half-hour convention boundary, when compareClaims runs, then the min finding reports the raw recomputed number, not a fabricated minutes phrase', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 1, medianHours: 2, minHours: 2, maxHours: 2 };
  const costClaims = { runCount: '1', median: '2', min: 'under 60 minutes', max: '2' };

  const result = sut(recomputed, costClaims);

  assert.ok(
    result.includes('telemetry:min: readme=under 60 minutes recomputed=2'),
    `min drift must report the raw recomputed number once hours cross the half-hour convention boundary, never a minutes phrase or the literal "null"; got: ${JSON.stringify(result)}`,
  );
});

test('Given recomputed minHours above the boundary (no phrase convention applies) and a README min that is itself null, when compareClaims runs, then drift is still reported, not silently matched away', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 1, medianHours: 2, minHours: 2, maxHours: 2 };
  const costClaims = { runCount: '1', median: '2', min: null, max: '2' };

  const result = sut(recomputed, costClaims);

  assert.ok(
    result.some((line) => line.startsWith('telemetry:min:')),
    'a null README min must never be treated as matching the no-phrase-applies case',
  );
});
