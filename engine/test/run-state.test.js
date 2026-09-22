/**
 * In-process unit tests for the pure ledger→state derivation. No I/O beyond
 * reading the shared fixture ledgers as plain strings; the function under
 * test never touches the filesystem itself.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deriveRunState } from '../src/run-state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_ID = 'demo';

const DEFAULT_IDS = [
  'workspace', 'design', 'decisions', 'planning', 'implementation',
  'review', 'refactoring', 'validation', 'documentation', 'propose', 'integrate',
];

const ARCHITECTURE_IDS = [
  'workspace', 'design', 'decisions', 'planning', 'implementation',
  'review', 'refactoring', 'validation', 'architecture', 'documentation', 'propose', 'integrate',
];

function makeResolution(ids, awaiting) {
  return {
    effective: ids.map((id) => ({ id })),
    gateDecisions: [{ phaseId: 'propose', awaitingHarnesses: awaiting }],
  };
}

function readFixture(name) {
  return readFileSync(join(HERE, 'fixtures', 'run-ledger', name), 'utf8').split('\n');
}

const DEFAULT_RESOLUTION = makeResolution(DEFAULT_IDS, ['validation']);
const ARCHITECTURE_RESOLUTION = makeResolution(ARCHITECTURE_IDS, ['validation', 'architecture']);

test('Given mid-review.md and the default resolution, when deriveRunState runs for demo, then completed, inFlight and next are the fixture expected values', () => {
  const sut = deriveRunState;

  const result = sut(readFixture('mid-review.md'), RUN_ID, DEFAULT_RESOLUTION);

  assert.equal(result.kind, 'state');
  assert.deepEqual(result.state.completed, ['workspace', 'design', 'decisions', 'planning', 'implementation']);
  assert.deepEqual(result.state.inFlight, [{ phase: 'review', since: '2026-09-22T10:40:00Z' }]);
  assert.equal(result.state.next, 'refactoring');
});

test('Given design-revision.md, when deriveRunState runs for demo, then design is in flight since its last start and absent from completed', () => {
  const sut = deriveRunState;

  const result = sut(readFixture('design-revision.md'), RUN_ID, DEFAULT_RESOLUTION);

  assert.deepEqual(result.state.completed, ['workspace', 'decisions']);
  assert.deepEqual(result.state.inFlight, [{ phase: 'design', since: '2026-09-22T10:30:00Z' }]);
  assert.equal(result.state.next, 'planning');
});

test('Given parallel.md, when deriveRunState runs for demo, then inFlight lists validation then documentation and next is propose', () => {
  const sut = deriveRunState;

  const result = sut(readFixture('parallel.md'), RUN_ID, DEFAULT_RESOLUTION);

  assert.deepEqual(result.state.inFlight, [
    { phase: 'validation', since: '2026-09-22T11:00:00Z' },
    { phase: 'documentation', since: '2026-09-22T11:02:00Z' },
  ]);
  assert.equal(result.state.next, 'propose');
});

const AWAITING_VALIDATION_LINE = 'demo resolve AWAITING(propose): validation';

const RELEASED_CASES = [
  ['an auto-skip marker', 'demo validation auto-skip: validation — evaluated unnecessary (no boundary change)'],
  ['an exact NO-OP(validation) marker', 'demo validation NO-OP(validation): released manually'],
  ['a green GATE(validation) marker', 'demo validation GATE(validation): green'],
];

for (const [title, line] of RELEASED_CASES) {
  test(`Given ${title}, when deriveRunState runs for demo, then awaitingHarnesses is empty`, () => {
    const sut = deriveRunState;

    const result = sut([AWAITING_VALIDATION_LINE, line], RUN_ID, DEFAULT_RESOLUTION);

    assert.deepEqual(result.state.awaitingHarnesses, []);
  });
}

const NOT_RELEASED_CASES = [
  ['a technique-scoped NO-OP(validation:sample-technique) marker', ['demo validation NO-OP(validation:sample-technique): declined']],
  ['an unrelated NO-OP(verify) marker', ['demo validation NO-OP(verify): no DoD declared']],
  ['a green GATE(validation) followed by a red one', ['demo validation GATE(validation): green', 'demo validation GATE(validation): red']],
];

for (const [title, lines] of NOT_RELEASED_CASES) {
  test(`Given ${title}, when deriveRunState runs for demo, then awaitingHarnesses still holds validation`, () => {
    const sut = deriveRunState;

    const result = sut([AWAITING_VALIDATION_LINE, ...lines], RUN_ID, DEFAULT_RESOLUTION);

    assert.deepEqual(result.state.awaitingHarnesses, ['validation']);
  });
}

test('Given a ledger awaiting validation and a resolution awaiting validation and architecture, when deriveRunState runs, then kind is awaiting-mismatch with both sets', () => {
  const sut = deriveRunState;

  const result = sut([AWAITING_VALIDATION_LINE], RUN_ID, makeResolution(DEFAULT_IDS, ['validation', 'architecture']));

  assert.deepEqual(result, { kind: 'awaiting-mismatch', ledger: ['validation'], resolution: ['validation', 'architecture'] });
});

test('Given a ledger and a resolution awaiting the same ids in a different order, when deriveRunState runs, then kind is state', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve AWAITING(propose): architecture, validation'],
    RUN_ID,
    makeResolution(ARCHITECTURE_IDS, ['validation', 'architecture']),
  );

  assert.equal(result.kind, 'state');
});

test('Given no AWAITING line and a non-empty resolved set, when deriveRunState runs, then kind is awaiting-mismatch with a null ledger side', () => {
  const sut = deriveRunState;

  const result = sut([], RUN_ID, DEFAULT_RESOLUTION);

  assert.deepEqual(result, { kind: 'awaiting-mismatch', ledger: null, resolution: ['validation'] });
});

test('Given no AWAITING line and an empty resolved set, when deriveRunState runs, then kind is state with a missing-AWAITING warning', () => {
  const sut = deriveRunState;

  const result = sut([], RUN_ID, makeResolution(DEFAULT_IDS, []));

  assert.equal(result.kind, 'state');
  assert.deepEqual(result.state.warnings, ['no AWAITING(propose) line for run demo']);
});

test('Given mixed-runs.md, when deriveRunState runs for demo, then only demo lines count', () => {
  const sut = deriveRunState;

  const result = sut(readFixture('mixed-runs.md'), RUN_ID, DEFAULT_RESOLUTION);

  assert.deepEqual(result.state.completed, ['workspace', 'design']);
  assert.deepEqual(result.state.inFlight, [{ phase: 'decisions', since: '2026-09-22T10:15:00Z' }]);
  assert.equal(result.state.next, 'planning');
  assert.deepEqual(result.state.awaitingHarnesses, ['validation']);
});

test('Given mid-review.md, when deriveRunState runs for demo, then parts and findings hold the recorded entries', () => {
  const sut = deriveRunState;

  const result = sut(readFixture('mid-review.md'), RUN_ID, DEFAULT_RESOLUTION);

  assert.deepEqual(result.state.parts, [{ n: 1, sha: 'abc1234', size: 'pure-module', outcome: 'pass' }]);
  assert.deepEqual(result.state.findings, [
    { dimension: 'code', cycle: 1, path: '/tmp/craft-review.fixture/code.c1.json', count: 3 },
  ]);
});

test('Given two PART(1) lines with different outcomes, when deriveRunState runs, then the last one wins', () => {
  const sut = deriveRunState;

  const result = sut(
    [
      'demo implementation PART(1): abc1234 size=pure-module outcome=pass',
      'demo implementation PART(1): def5678 size=pure-module outcome=blocked',
    ],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.parts, [{ n: 1, sha: 'def5678', size: 'pure-module', outcome: 'blocked' }]);
});

test('Given a FINDINGS record whose path contains a space, when deriveRunState runs, then it adds a warning and no findings entry', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve AWAITING(propose): none', 'demo review FINDINGS(code): c1 /tmp/a b.json n=2'],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.findings, []);
  assert.equal(result.state.warnings.length, 1);
});

test('Given a PHASE-START for a phase absent from effective, when deriveRunState runs, then it adds a warning and the phase is not in flight', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve AWAITING(propose): none', 'demo bench PHASE-START(bench): 2026-09-22T10:00:00Z'],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.inFlight, []);
  assert.equal(result.state.warnings.length, 1);
});

test('Given mid-validation.md and the enable-architecture resolution, when deriveRunState runs for demo, then next is propose, awaitingHarnesses is validation, and background holds the harness pid as a number', () => {
  const sut = deriveRunState;

  const result = sut(readFixture('mid-validation.md'), RUN_ID, ARCHITECTURE_RESOLUTION);

  assert.equal(result.kind, 'state');
  assert.equal(result.state.next, 'propose');
  assert.deepEqual(result.state.awaitingHarnesses, ['validation']);
  assert.deepEqual(result.state.background, [
    {
      phase: 'validation',
      technique: 'sample-technique',
      pid: 4242,
      out: '/tmp/craft-validation.fixture/out',
      spec: '/tmp/craft-validation.fixture/spec',
    },
  ]);
});
