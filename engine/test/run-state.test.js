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

test('Given a ledger awaiting two harnesses and a resolution awaiting a one-element subset of them, when deriveRunState runs, then it is still a mismatch', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve AWAITING(propose): validation,architecture'],
    RUN_ID,
    makeResolution(DEFAULT_IDS, ['validation']),
  );

  assert.deepEqual(result, {
    kind: 'awaiting-mismatch',
    ledger: ['validation', 'architecture'],
    resolution: ['validation'],
  });
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

test('Given no AWAITING line and an empty resolved set, when deriveRunState runs, then kind is state with a missing-AWAITING warning and no awaiting harnesses', () => {
  const sut = deriveRunState;

  const result = sut([], RUN_ID, makeResolution(DEFAULT_IDS, []));

  assert.equal(result.kind, 'state');
  assert.deepEqual(result.state.warnings, ['no AWAITING(propose) line for run demo']);
  assert.deepEqual(result.state.awaitingHarnesses, []);
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
  assert.deepEqual(result.state.warnings, ['malformed FINDINGS record: FINDINGS(code): c1 /tmp/a b.json n=2']);
});

test('Given a PHASE-START for a phase absent from effective, when deriveRunState runs, then it adds a warning and the phase is not in flight', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve AWAITING(propose): none', 'demo bench PHASE-START(bench): 2026-09-22T10:00:00Z'],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.inFlight, []);
  assert.deepEqual(result.state.warnings, ['phase bench is not in the effective pipeline']);
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

const MALFORMED_TIMELINE_RECORDS = [
  {
    label: 'a PHASE-START whose timestamp holds a space',
    line: 'demo design PHASE-START(design): 2026-09-22 10:05:00',
    warning: 'malformed PHASE-START record: PHASE-START(design): 2026-09-22 10:05:00',
  },
  {
    label: 'a PHASE-DONE with no outcome separator',
    line: 'demo review PHASE-DONE(review):',
    warning: 'malformed PHASE-DONE record: PHASE-DONE(review):',
  },
];

for (const { label, line, warning } of MALFORMED_TIMELINE_RECORDS) {
  test(`Given ${label}, when deriveRunState runs, then it adds exactly one malformed-record warning`, () => {
    const sut = deriveRunState;

    const result = sut(['demo resolve AWAITING(propose): none', line], RUN_ID, makeResolution(DEFAULT_IDS, []));

    assert.deepEqual(result.state.warnings, [warning]);
  });
}

test('Given FINDINGS and HARNESS-BG ids outside the lowercase slug charset, when deriveRunState runs, then both are collected without a warning', () => {
  const sut = deriveRunState;

  const result = sut(
    [
      'demo resolve AWAITING(propose): none',
      'demo review FINDINGS(Code_Style): c1 /tmp/code.c1.json n=2',
      'demo validation HARNESS-BG(validation:sample_technique): pid=42 out=/tmp/out.log spec=none',
    ],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.equal(result.state.findings.length, 1);
  assert.equal(result.state.findings[0].dimension, 'Code_Style');
  assert.equal(result.state.background.length, 1);
  assert.deepEqual(result.state.warnings, []);
});

test('Given an AWAITING line of "none" with a trailing space, when deriveRunState runs against an empty resolved set, then it is not a mismatch', () => {
  const sut = deriveRunState;

  const result = sut(['demo resolve AWAITING(propose): none '], RUN_ID, makeResolution(DEFAULT_IDS, []));

  assert.equal(result.kind, 'state');
});

test('Given an AWAITING list with a trailing comma, when deriveRunState runs, then the empty id is dropped', () => {
  const sut = deriveRunState;

  const result = sut(['demo resolve AWAITING(propose): validation,'], RUN_ID, makeResolution(DEFAULT_IDS, ['validation']));

  assert.equal(result.kind, 'state');
  assert.deepEqual(result.state.awaitingHarnesses, ['validation']);
});

// ── LINE_RE anchoring: a line reaching parseRecord's regex must match in full ──

test('Given a ledger line with leading whitespace before the run id, when deriveRunState runs, then the line is rejected, not parsed from its first non-space token', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve AWAITING(propose): none', ' demo workspace PHASE-START(workspace): 2026-09-22T10:00:00Z'],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.inFlight, []);
  assert.deepEqual(result.state.completed, []);
});

test('Given a ledger line carrying an embedded newline after its record, when deriveRunState runs, then the whole line is rejected, not matched up to the newline', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve AWAITING(propose): none', 'demo workspace PHASE-START(workspace): 2026-09-22T10:00:00Z\nEXTRA'],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.inFlight, []);
  assert.deepEqual(result.state.completed, []);
});

// ── AWAITING_RE anchoring: the token must open the record, not merely appear in it ──

test('Given an AWAITING(propose) token that is not at the start of its record, when deriveRunState runs, then it is not recognized as the run\'s awaiting line', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve junk AWAITING(propose): validation'],
    RUN_ID,
    makeResolution(DEFAULT_IDS, ['validation']),
  );

  assert.deepEqual(result, { kind: 'awaiting-mismatch', ledger: null, resolution: ['validation'] });
});

// ── PART_RE anchoring and digit width ──

test('Given a PART record with trailing content after its outcome, when deriveRunState runs, then it is rejected as malformed, not matched up to the outcome', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve AWAITING(propose): none', 'demo implementation PART(1): abc1234 size=pure-module outcome=pass extra'],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.parts, []);
  assert.deepEqual(result.state.warnings, [
    'malformed PART record: PART(1): abc1234 size=pure-module outcome=pass extra',
  ]);
});

test('Given a malformed PART prefix followed by a well-formed PART record later in the same string, when deriveRunState runs, then the whole record is rejected, not salvaged from its later match', () => {
  const sut = deriveRunState;

  const result = sut(
    [
      'demo resolve AWAITING(propose): none',
      'demo implementation PART(x): abc1234 size=pure-module outcome=pass PART(1): def5678 size=pure-module outcome=pass',
    ],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.parts, []);
  assert.equal(result.state.warnings.length, 1);
});

test('Given a PART record with a two-digit part number, when deriveRunState runs, then parts[0].n is the full number, not just its first digit', () => {
  const sut = deriveRunState;

  const result = sut(
    ['demo resolve AWAITING(propose): none', 'demo implementation PART(12): abc1234 size=pure-module outcome=pass'],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.parts, [{ n: 12, sha: 'abc1234', size: 'pure-module', outcome: 'pass' }]);
});

// ── lastPartPerNumber sorts ascending, not just deduplicates ──

test('Given PART records for three different part numbers submitted out of order, when deriveRunState runs, then parts sort ascending by number', () => {
  const sut = deriveRunState;

  const result = sut(
    [
      'demo implementation PART(3): abc1234 size=pure-module outcome=pass',
      'demo implementation PART(1): def5678 size=pure-module outcome=pass',
      'demo implementation PART(2): fed4321 size=pure-module outcome=pass',
    ],
    RUN_ID,
    makeResolution(DEFAULT_IDS, []),
  );

  assert.deepEqual(result.state.parts.map((part) => part.n), [1, 2, 3]);
});

// ── checkMalformedPrefixes: the AWAITING(propose) prefix check itself ──

test('Given a malformed AWAITING(propose) record whose paren content is not "propose", when deriveRunState runs, then it adds a malformed AWAITING(propose) warning', () => {
  const sut = deriveRunState;

  const result = sut(['demo resolve AWAITING(something): x'], RUN_ID, makeResolution(DEFAULT_IDS, []));

  assert.equal(result.kind, 'state');
  assert.ok(
    result.state.warnings.includes('malformed AWAITING(propose) record: AWAITING(something): x'),
    `expected a malformed AWAITING(propose) warning, got: ${JSON.stringify(result.state.warnings)}`,
  );
});

// ── resolvedAwaiting: gateDecisions lookup edge cases ──

test('Given a resolution with no gateDecisions field, when deriveRunState runs, then it resolves to no awaiting harnesses without throwing', () => {
  const sut = deriveRunState;
  const resolution = { effective: DEFAULT_IDS.map((id) => ({ id })) };

  const result = sut([], RUN_ID, resolution);

  assert.equal(result.kind, 'state');
  assert.deepEqual(result.state.awaitingHarnesses, []);
});

test('Given gateDecisions with no propose entry, when deriveRunState runs, then it resolves to no awaiting harnesses without throwing', () => {
  const sut = deriveRunState;
  const resolution = {
    effective: DEFAULT_IDS.map((id) => ({ id })),
    gateDecisions: [{ phaseId: 'review', awaitingHarnesses: ['decoy'] }],
  };

  const result = sut([], RUN_ID, resolution);

  assert.equal(result.kind, 'state');
  assert.deepEqual(result.state.awaitingHarnesses, []);
});

test('Given gateDecisions with a non-propose entry listed before the propose entry, when deriveRunState runs, then only the propose entry\'s awaitingHarnesses is used', () => {
  const sut = deriveRunState;
  const resolution = {
    effective: DEFAULT_IDS.map((id) => ({ id })),
    gateDecisions: [
      { phaseId: 'review', awaitingHarnesses: ['decoy'] },
      { phaseId: 'propose', awaitingHarnesses: ['validation'] },
    ],
  };

  const result = sut(['demo resolve AWAITING(propose): validation'], RUN_ID, resolution);

  assert.equal(result.kind, 'state');
});

test('Given a propose gate decision with no awaitingHarnesses field, when deriveRunState runs against a ledger with no AWAITING line, then it resolves to no awaiting harnesses, not a mismatch', () => {
  const sut = deriveRunState;
  const resolution = {
    effective: DEFAULT_IDS.map((id) => ({ id })),
    gateDecisions: [{ phaseId: 'propose' }],
  };

  const result = sut([], RUN_ID, resolution);

  assert.equal(result.kind, 'state');
  assert.deepEqual(result.state.warnings, ['no AWAITING(propose) line for run demo']);
});
