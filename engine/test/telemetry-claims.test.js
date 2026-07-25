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

test('Given a recomputed minHours that rounds to 1.0 instead of 0.5, when compareClaims, then a telemetry:min finding is produced', () => {
  const sut = compareClaims;
  const recomputed = { runCount: 27, medianHours: 1.2942, minHours: 1.1, maxHours: 5.0083 };
  const costClaims = { runCount: '27', median: '1.3', min: 'half an hour', max: '5' };

  const result = sut(recomputed, costClaims);

  const finding = result.find((line) => line.startsWith('telemetry:min'));
  assert.ok(finding, 'expected a telemetry:min finding');
});
