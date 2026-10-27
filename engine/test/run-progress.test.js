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
  assert.ok(result.items.filter((item) => item.status !== 'completed').every((item) => item.note === ''));
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

function linesBefore(lines, marker) {
  const index = lines.findIndex((line) => line.includes(marker));
  return index === -1 ? lines : lines.slice(0, index);
}

function noteOf(result, id) {
  return result.items.find((item) => item.id === id).note;
}

test('Given planning-no-op.md, when projectProgress runs, then a completed phase notes its NO-OP text over its PHASE-DONE outcome', () => {
  const sut = projectProgress;
  const lines = readFixture('planning-no-op.md');

  const result = sut(lines, RUN_ID);

  assert.equal(noteOf(result, 'planning'), 'no part remains — R1 → 1a2b3c4, R2 → 5d6e7f8');
  assert.equal(noteOf(result, 'implementation'), 'no plan parts — planning recorded NO-OP(planning)');
  assert.equal(noteOf(result, 'workspace'), 'ok');
});

test('Given with-effective.md, when projectProgress runs, then an auto-skipped phase notes its signal', () => {
  const sut = projectProgress;
  const lines = readFixture('with-effective.md');

  const result = sut(lines, RUN_ID);

  assert.equal(noteOf(result, 'decisions'), 'no decision candidates');
  assert.equal(noteOf(result, 'workspace'), 'worktree ../craft-demo on feat/demo');
  assert.equal(noteOf(result, 'planning'), '');
});

test('Given an auto-skip without a parenthetical, when projectProgress runs, then the note is the fallback', () => {
  const sut = projectProgress;
  const lines = ['demo resolve EFFECTIVE: decisions', 'demo decisions auto-skip: decisions'];

  const result = sut(lines, RUN_ID);

  assert.equal(noteOf(result, 'decisions'), 'auto-skipped');
});

test('Given a PHASE-DONE outcome holding control and line-breaking characters, when projectProgress runs, then the note comes out stripped', () => {
  const sut = projectProgress;
  const outcome = 'a\u001b[31mb\u0085c‮d⁦e\tf\u007f';
  const lines = ['demo resolve EFFECTIVE: workspace', `demo workspace PHASE-DONE(workspace): ${outcome}`];

  const result = sut(lines, RUN_ID);

  assert.equal(noteOf(result, 'workspace'), 'a[31mbcde\tf');
});

test('Given a 500-character outcome, when projectProgress runs, then the note is cut to 120 characters', () => {
  const sut = projectProgress;
  const lines = ['demo resolve EFFECTIVE: workspace', `demo workspace PHASE-DONE(workspace): ${'x'.repeat(500)}`];

  const result = sut(lines, RUN_ID);

  assert.equal(noteOf(result, 'workspace'), 'x'.repeat(120));
});

test('Given an outcome of astral characters, when projectProgress runs, then the cut never splits a surrogate pair', () => {
  const sut = projectProgress;
  const lines = ['demo resolve EFFECTIVE: workspace', `demo workspace PHASE-DONE(workspace): ${'\u{1F600}'.repeat(200)}`];

  const result = sut(lines, RUN_ID);

  assert.equal([...noteOf(result, 'workspace')].length, 120);
  assert.equal(noteOf(result, 'workspace'), '\u{1F600}'.repeat(120));
});

test('Given impacts-and-cycles.md cut before the passing second PART, when projectProgress runs, then implementation holds a completed first part and a blocked second one', () => {
  const sut = projectProgress;
  const lines = linesBefore(readFixture('impacts-and-cycles.md'), 'PART(2): 0a1b2c3');

  const result = sut(lines, RUN_ID);

  assert.deepEqual(result.items.find((item) => item.id === 'implementation').children, [
    { label: 'part 1', status: 'completed', note: 'abc1234' },
    { label: 'part 2', status: 'in_progress', note: 'blocked' },
  ]);
});

test('Given the full impacts-and-cycles.md, when projectProgress runs, then the later pass supersedes the blocked part', () => {
  const sut = projectProgress;
  const lines = readFixture('impacts-and-cycles.md');

  const result = sut(lines, RUN_ID);

  assert.deepEqual(result.items.find((item) => item.id === 'implementation').children[1],
    { label: 'part 2', status: 'completed', note: '0a1b2c3' });
});

test('Given impacts-and-cycles.md cut before the review PHASE-DONE, when projectProgress runs, then review holds a completed first cycle with n=5 and an in-progress second cycle with n=0', () => {
  const sut = projectProgress;
  const lines = linesBefore(readFixture('impacts-and-cycles.md'), 'PHASE-DONE(review)');

  const result = sut(lines, RUN_ID);

  assert.deepEqual(result.items.find((item) => item.id === 'review').children, [
    { label: 'cycle 1', status: 'completed', note: 'n=5' },
    { label: 'cycle 2', status: 'in_progress', note: 'n=0' },
  ]);
});

test('Given the full impacts-and-cycles.md, when projectProgress runs, then both review cycles are completed', () => {
  const sut = projectProgress;
  const lines = readFixture('impacts-and-cycles.md');

  const result = sut(lines, RUN_ID);

  assert.deepEqual(result.items.find((item) => item.id === 'review').children.map((child) => child.status),
    ['completed', 'completed']);
});

test('GUARD Given the full impacts-and-cycles.md, when projectProgress runs, then the impact tokens raise no warning and impact-triage is in progress', () => {
  const sut = projectProgress;
  const lines = readFixture('impacts-and-cycles.md');

  const result = sut(lines, RUN_ID);

  assert.deepEqual(result.warnings, []);
  assert.equal(result.items.find((item) => item.id === 'impact-triage').status, 'in_progress');
  assert.equal(result.items.find((item) => item.id === 'review').status, 'completed');
});

test('Given another run writes EFFECTIVE and outcomes after this run, when projectProgress runs, then only this run shapes the items and notes', () => {
  // Arrange
  const lines = [
    ...readFixture('with-effective.md'),
    'other resolve EFFECTIVE: design,propose',
    'other workspace PHASE-DONE(workspace): foreign outcome',
  ];

  // Act
  const result = projectProgress(lines, RUN_ID);

  // Assert
  assert.equal(result.items.length, 9);
  assert.equal(result.items[0].id, 'workspace');
  assert.ok(!result.items[0].note.includes('foreign'));
});

test('Given a ledger with no EFFECTIVE record, when projectProgress runs, then no ledger-only warning is raised', () => {
  const sut = projectProgress;
  const lines = ['demo resolve AWAITING(propose): none', 'demo decisions auto-skip: decisions (none)'];

  const result = sut(lines, RUN_ID);

  assert.deepEqual(result.warnings, []);
});

test('Given an auto-skip record with several parentheticals, when projectProgress runs, then the note is the trailing one', () => {
  const sut = projectProgress;
  const lines = ['demo resolve EFFECTIVE: decisions', 'demo decisions auto-skip: decisions (first) then (last)'];

  const result = sut(lines, RUN_ID);

  assert.equal(noteOf(result, 'decisions'), 'last');
});

test('Given an auto-skip record whose trailing parenthetical is followed by spaces, when projectProgress runs, then the note is still that parenthetical', () => {
  const sut = projectProgress;
  const lines = ['demo resolve EFFECTIVE: decisions', 'demo decisions auto-skip: decisions (no candidates)  '];

  const result = sut(lines, RUN_ID);

  assert.equal(noteOf(result, 'decisions'), 'no candidates');
});

test('Given a phase restarted after its PHASE-DONE, when projectProgress runs, then the in-progress phase carries no note', () => {
  const sut = projectProgress;
  const lines = [
    'demo resolve EFFECTIVE: decisions',
    'demo decisions PHASE-DONE(decisions): ok',
    'demo decisions PHASE-START(decisions): 2026-10-27T09:00:00Z',
  ];

  const result = sut(lines, RUN_ID);

  assert.equal(result.items[0].status, 'in_progress');
  assert.equal(noteOf(result, 'decisions'), '');
});

test('Given review findings recorded out of cycle order, when projectProgress runs, then cycles are numerically ordered and only the newest is in progress', () => {
  const sut = projectProgress;
  const lines = [
    'demo resolve EFFECTIVE: review',
    'demo review PHASE-START(review): 2026-10-27T09:00:00Z',
    'demo review FINDINGS(code): c3 /x/c3.json n=1',
    'demo review FINDINGS(code): c10 /x/c10.json n=2',
    'demo review FINDINGS(code): c1 /x/c1.json n=3',
    'demo review FINDINGS(code): c2 /x/c2.json n=4',
  ];

  const result = sut(lines, RUN_ID);

  assert.deepEqual(result.items[0].children, [
    { label: 'cycle 1', status: 'completed', note: 'n=3' },
    { label: 'cycle 2', status: 'completed', note: 'n=4' },
    { label: 'cycle 3', status: 'completed', note: 'n=1' },
    { label: 'cycle 10', status: 'in_progress', note: 'n=2' },
  ]);
});

test('Given the full impacts-and-cycles.md, when projectProgress runs, then only implementation and review carry children', () => {
  const sut = projectProgress;
  const lines = readFixture('impacts-and-cycles.md');

  const result = sut(lines, RUN_ID);

  const withChildren = result.items.filter((item) => item.children.length > 0).map((item) => item.id);
  assert.deepEqual(withChildren, ['implementation', 'review']);
});

test('Given a PHASE-DONE outcome holding a line separator, when projectProgress runs, then the phase completes with the separator stripped from its note', () => {
  // Arrange
  const lines = [
    'demo resolve EFFECTIVE: workspace,design',
    'demo workspace PHASE-START(workspace): 2026-10-27T09:00:00Z',
    `demo workspace PHASE-DONE(workspace): worktree${String.fromCharCode(0x2028)}ready`,
  ];

  // Act
  const result = projectProgress(lines, RUN_ID);

  // Assert
  assert.equal(result.items[0].status, 'completed');
  assert.equal(result.items[0].note, 'worktreeready');
});
