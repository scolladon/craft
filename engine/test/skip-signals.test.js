/**
 * In-process unit tests for the pure phase-skip signal detector: the fixed
 * `auto-skip: <phase>` run-record token grammar (ADR-146) and its fold into
 * `phase-skip` recommendations. No I/O — plain string/array inputs.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoSkipPhasesInText, phaseSkipRecs } from '../src/observability/skip-signals.js';

// ─── autoSkipPhasesInText ────────────────────────────────────────────────────

test('Given a fixed auto-skip line, when autoSkipPhasesInText scans it, then it returns the canonical phase', () => {
  const sut = autoSkipPhasesInText;

  const result = sut('auto-skip: review — evaluated unnecessary (no source diff in scope)');

  assert.deepEqual(result, ['review']);
});

test('Given operator-waiver and ran-empty tokens, when autoSkipPhasesInText scans them, then it ignores both', () => {
  const sut = autoSkipPhasesInText;

  const result = sut('WAIVER: skipped by operator\nNO-OP(refactoring): ran, found nothing');

  assert.deepEqual(result, []);
});

test('Given unrelated prose, when autoSkipPhasesInText scans it, then it returns an empty list', () => {
  const sut = autoSkipPhasesInText;

  const result = sut('the review phase produced a clean report');

  assert.deepEqual(result, []);
});

test('Given a blob with several auto-skip lines, when autoSkipPhasesInText scans it, then it returns every phase in order', () => {
  const sut = autoSkipPhasesInText;

  const result = sut('auto-skip: decisions — evaluated unnecessary (all clear)\nauto-skip: refactoring — evaluated unnecessary (no gain)');

  assert.deepEqual(result, ['decisions', 'refactoring']);
});

test('Given a non-string input, when autoSkipPhasesInText is called, then it returns an empty list without throwing', () => {
  const sut = autoSkipPhasesInText;

  const result = sut(null);

  assert.deepEqual(result, []);
});

test('Given an auto-skip token with no space after the colon, when autoSkipPhasesInText scans it, then it still captures the phase', () => {
  const sut = autoSkipPhasesInText;

  const result = sut('auto-skip:review — evaluated unnecessary (x)');

  assert.deepEqual(result, ['review']);
});

// ─── phaseSkipRecs ───────────────────────────────────────────────────────────

test('Given one marker, when phaseSkipRecs folds it, then it yields one phase-skip rec of the fixed shape', () => {
  const sut = phaseSkipRecs;

  const result = sut([{ run: 'r1', phase: 'review' }]);

  assert.deepEqual(result, [{
    kind: 'phase-skip',
    run: 'r1',
    phase: 'review',
    model: null,
    detail: 'phase review auto-skipped (evaluated unnecessary)',
    evidence: { marker: 'auto-skip' },
  }]);
});

test('Given two markers with the same run and phase, when phaseSkipRecs folds them, then it deduplicates to one rec', () => {
  const sut = phaseSkipRecs;

  const result = sut([{ run: 'r1', phase: 'review' }, { run: 'r1', phase: 'review' }]);

  assert.equal(result.length, 1);
});

test('Given the same phase auto-skipped in two runs, when phaseSkipRecs folds them, then it keeps both distinct-run recs', () => {
  const sut = phaseSkipRecs;

  const result = sut([{ run: 'r2', phase: 'review' }, { run: 'r1', phase: 'review' }]);

  assert.deepEqual(result.map(r => r.run), ['r1', 'r2']);
});

test('Given no markers, when phaseSkipRecs folds them, then it returns an empty list', () => {
  const sut = phaseSkipRecs;

  const result = sut([]);

  assert.deepEqual(result, []);
});
