/**
 * In-process unit tests for the pure ledger→progress projection. No I/O
 * beyond reading the shared fixture ledgers as plain strings.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { projectProgress } from '../src/run-progress.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_ID = 'demo';

function readFixture(name) {
  return readFileSync(join(HERE, 'fixtures', 'run-ledger', name), 'utf8').split('\n');
}

test('Given with-effective.md, when projectProgress runs for demo, then items follow the EFFECTIVE order with statuses from the ledger', () => {
  const sut = projectProgress;
  const lines = readFixture('with-effective.md');

  const result = sut(lines, RUN_ID);

  assert.equal(result.source, 'effective');
  assert.equal(result.run, 'demo');
  assert.deepEqual(result.items.map((item) => item.id), [
    'workspace', 'design', 'decisions', 'planning', 'implementation',
    'review', 'validation', 'propose', 'integrate',
  ]);
  assert.deepEqual(result.items.map((item) => item.status), [
    'completed', 'completed', 'completed', 'in_progress',
    'pending', 'pending', 'pending', 'pending', 'pending',
  ]);
  assert.deepEqual(result.inFlight, ['planning']);
  assert.equal(result.next, 'implementation');
  assert.deepEqual(result.warnings, []);
  assert.ok(result.items.every((item) => item.note === ''));
  assert.ok(result.items.every((item) => item.children.length === 0));
});

test('Given mid-review.md with no EFFECTIVE record, when projectProgress runs, then the source is ledger-only and items list the named phases in first-appearance order', () => {
  const sut = projectProgress;
  const lines = readFixture('mid-review.md');

  const result = sut(lines, RUN_ID);

  assert.equal(result.source, 'ledger-only');
  assert.deepEqual(result.items.map((item) => item.id), [
    'workspace', 'design', 'decisions', 'planning', 'implementation', 'review',
  ]);
  assert.deepEqual(result.items.map((item) => item.status), [
    'completed', 'completed', 'completed', 'completed', 'completed', 'in_progress',
  ]);
  assert.ok(result.warnings.every((warning) => !warning.includes('not in the effective pipeline')));
});

test('Given a ledger whose EFFECTIVE record is malformed, when projectProgress runs, then it warns once and falls back to ledger-only', () => {
  const sut = projectProgress;
  const lines = readFixture('with-effective.md').map((line) => (
    line.startsWith('demo resolve EFFECTIVE:') ? 'demo resolve EFFECTIVE: Workspace, design' : line
  ));

  const result = sut(lines, RUN_ID);

  assert.equal(result.warnings[0], 'malformed EFFECTIVE record: EFFECTIVE: Workspace, design');
  assert.equal(result.warnings.filter((warning) => warning.includes('malformed EFFECTIVE')).length, 1);
  assert.equal(result.source, 'ledger-only');
});

test('Given mid-validation.md, when projectProgress runs, then background lists the in-flight phase harness pid', () => {
  const sut = projectProgress;
  const lines = readFixture('mid-validation.md');

  const result = sut(lines, RUN_ID);

  assert.deepEqual(result.background, [{ phase: 'validation', pid: 4242 }]);
});

test('Given mid-validation.md plus a validation PHASE-DONE, when projectProgress runs, then background is empty', () => {
  const sut = projectProgress;
  const lines = [...readFixture('mid-validation.md'), 'demo validation PHASE-DONE(validation): ok'];

  const result = sut(lines, RUN_ID);

  assert.deepEqual(result.background, []);
});

test('Given with-effective.md plus a PHASE-START for architecture, when projectProgress runs, then the out-of-pipeline warning is carried and no architecture item is invented', () => {
  const sut = projectProgress;
  const lines = [...readFixture('with-effective.md'), 'demo architecture PHASE-START(architecture): 2026-10-27T09:20:00Z'];

  const result = sut(lines, RUN_ID);

  assert.ok(result.warnings.includes('phase architecture is not in the effective pipeline'));
  assert.ok(result.items.every((item) => item.id !== 'architecture'));
});
