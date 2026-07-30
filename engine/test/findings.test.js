import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { normalizeFindings, parseScopeSpec, filterFindings } from '../src/findings.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dir, 'fixtures', 'findings');

function readFixture(name) {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

// ─── canonical Finding shape expected from both layouts ──────────────────────

const EXPECTED_FINDINGS = [
  {
    file: 'src/foo.js',
    line: 42,
    severity: 'error',
    finding: 'Unused variable x',
    fix: 'Remove the declaration',
  },
  {
    file: 'src/bar.js',
    line: 7,
    severity: 'warning',
    finding: 'Missing return type',
    fix: 'Add explicit return type',
  },
];

// ─── JSON array shape → Finding[] ────────────────────────────────────────────

test('Given a JSON array fixture, when normalizeFindings runs, then it returns a Finding[] with canonical fields', () => {
  const raw = readFixture('array.json');
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.deepEqual(result, EXPECTED_FINDINGS);
});

// ─── per-line shape → same Finding[] ─────────────────────────────────────────

test('Given a per-line fixture, when normalizeFindings runs, then it returns the same Finding[] as the JSON array', () => {
  const raw = readFixture('per-line.txt');
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.deepEqual(result, EXPECTED_FINDINGS);
});

// ─── R10 anchor: both layouts produce identical field-keyed output ─────────────

test('Given JSON and per-line fixtures, when normalizeFindings runs on each, then results are deeply equal (R10)', () => {
  const sut = normalizeFindings;

  const fromJson = sut(readFixture('array.json'));
  const fromLine = sut(readFixture('per-line.txt'));

  assert.deepEqual(fromJson, fromLine);
});

// ─── field-keyed access works under both shapes ───────────────────────────────

test('Given a JSON array fixture, when normalizeFindings runs, then result[0] fields are accessible by key', () => {
  const raw = readFixture('array.json');
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].file, 'src/foo.js');
  assert.equal(result[0].line, 42);
  assert.equal(result[0].severity, 'error');
  assert.equal(result[0].finding, 'Unused variable x');
  assert.equal(result[0].fix, 'Remove the declaration');
});

test('Given a per-line fixture, when normalizeFindings runs, then result[0] fields are accessible by key', () => {
  const raw = readFixture('per-line.txt');
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].file, 'src/foo.js');
  assert.equal(result[0].line, 42);
  assert.equal(result[0].severity, 'error');
  assert.equal(result[0].finding, 'Unused variable x');
  assert.equal(result[0].fix, 'Remove the declaration');
});

// ─── mixed-whitespace tolerance ───────────────────────────────────────────────

test('Given a mixed-whitespace per-line fixture, when normalizeFindings runs, then it normalizes correctly', () => {
  const raw = readFixture('mixed-whitespace.txt');
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.deepEqual(result, EXPECTED_FINDINGS);
});

// ─── empty input → [] ─────────────────────────────────────────────────────────

test('Given an empty string, when normalizeFindings runs, then it returns []', () => {
  const sut = normalizeFindings;

  const result = sut('');

  assert.deepEqual(result, []);
});

test('Given a whitespace-only string, when normalizeFindings runs, then it returns []', () => {
  const sut = normalizeFindings;

  const result = sut('   \n\n  ');

  assert.deepEqual(result, []);
});

test('Given an empty JSON array fixture, when normalizeFindings runs, then it returns []', () => {
  const raw = readFixture('empty.json');
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.deepEqual(result, []);
});

// ─── missing optional fix → tolerated ────────────────────────────────────────

test('Given a JSON entry without a fix field, when normalizeFindings runs, then it returns the Finding with fix undefined', () => {
  const raw = JSON.stringify([
    { file: 'src/x.js', line: 1, severity: 'info', finding: 'Some note' },
  ]);
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result.length, 1);
  assert.equal(result[0].file, 'src/x.js');
  assert.equal(result[0].severity, 'info');
  assert.ok(!('fix' in result[0]), 'fix must be genuinely absent, not set to undefined');
});

test('Given a per-line entry without a | fix part, when normalizeFindings runs, then it returns the Finding with fix undefined', () => {
  const raw = 'warning src/y.js:5 — Missing semicolon';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result.length, 1);
  assert.equal(result[0].file, 'src/y.js');
  assert.equal(result[0].line, 5);
  assert.equal(result[0].severity, 'warning');
  assert.equal(result[0].finding, 'Missing semicolon');
  assert.ok(!('fix' in result[0]), 'fix must be genuinely absent, not set to undefined');
});

test('Given a fix explicitly set to null in JSON, when normalizeFindings runs, then fix is omitted (not the string "null")', () => {
  const raw = JSON.stringify([
    { file: 'src/x.js', line: 1, severity: 'info', finding: 'Some note', fix: null },
  ]);
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.ok(!('fix' in result[0]), 'an explicit null fix must be omitted, never coerced to "null"');
});

test('Given a JSON fix value padded with whitespace, when normalizeFindings runs, then fix is trimmed', () => {
  const raw = JSON.stringify([
    { file: 'src/x.js', line: 1, severity: 'info', finding: 'Some note', fix: '  y  ' },
  ]);
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].fix, 'y');
});

// ─── status field (optional) ─────────────────────────────────────────────────

const EXPECTED_WITH_STATUS = [
  { file: 'src/a.js', line: 1, severity: 'CRITICAL', finding: 'real defect', fix: 'patch it', status: 'VERIFIED' },
  { file: 'src/b.js', line: 2, severity: 'HIGH', finding: 'maybe unsafe', status: 'SUSPECT' },
  { file: 'src/c.js', line: 3, severity: 'MEDIUM', finding: 'check this path', status: 'PROBE' },
  { file: 'src/d.js', line: 4, severity: 'LOW', finding: 'not a bug', fix: 'no change', status: 'RULED-OUT' },
  { file: 'src/e.js', line: 5, severity: 'error', finding: 'plain finding' },
];

test('Given a per-line fixture with status prefixes, when normalizeFindings runs, then each status is carried and the status-less row omits it', () => {
  const raw = readFixture('with-status.txt');
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.deepEqual(result, EXPECTED_WITH_STATUS);
  assert.ok(!('status' in result[4]), 'status-less line must not gain a status key');
});

test('Given a JSON fixture with status keys, when normalizeFindings runs, then each status is carried and the status-less record omits it', () => {
  const raw = readFixture('with-status.json');
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.deepEqual(result, EXPECTED_WITH_STATUS);
  assert.ok(!('status' in result[4]), 'status-less record must not gain a status key');
});

test('Given JSON and per-line with-status fixtures, when normalizeFindings runs on each, then results are deeply equal (R10)', () => {
  const sut = normalizeFindings;

  const fromJson = sut(readFixture('with-status.json'));
  const fromLine = sut(readFixture('with-status.txt'));

  assert.deepEqual(fromJson, fromLine);
});

test('Given a JSON entry without a status field, when normalizeFindings runs, then it returns the Finding with status genuinely absent', () => {
  const raw = JSON.stringify([
    { file: 'src/x.js', line: 1, severity: 'info', finding: 'Some note' },
  ]);
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.ok(!('status' in result[0]), 'status must be genuinely absent, not set to undefined');
});

test('Given a status explicitly set to null in JSON, when normalizeFindings runs, then status is omitted (not the string "null")', () => {
  const raw = JSON.stringify([
    { file: 'src/x.js', line: 1, severity: 'info', finding: 'Some note', status: null },
  ]);
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.ok(!('status' in result[0]), 'an explicit null status must be omitted, never coerced to "null"');
});

test('Given a JSON object with status listed before fix, when normalizeFindings runs, then the output key order is still file, line, severity, finding, fix, status', () => {
  const raw = JSON.stringify([
    { file: 'a.js', line: 1, severity: 'HIGH', finding: 'x', status: 'VERIFIED', fix: 'y' },
  ]);
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.deepEqual(Object.keys(result[0]), ['file', 'line', 'severity', 'finding', 'fix', 'status']);
});

test('Given a status token with no space after the colon, when normalizeFindings runs, then the whole token is the severity and no status is peeled', () => {
  const raw = 'VERIFIED:HIGH src/x.js:1 — x';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].severity, 'VERIFIED:HIGH');
  assert.ok(!('status' in result[0]), 'a colon not followed by whitespace must not peel a status');
});

test('Given a JSON status value outside the four-token vocabulary, when normalizeFindings runs, then it passes through unchanged', () => {
  const raw = JSON.stringify([
    { file: 'src/x.js', line: 1, severity: 'HIGH', finding: 'x', status: 'WHATEVER' },
  ]);
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].status, 'WHATEVER');
});

test('Given a status-bearing record without a fix, when normalizeFindings runs, then the output key order is file, line, severity, finding, status', () => {
  const raw = JSON.stringify([
    { file: 'a.js', line: 1, severity: 'MEDIUM', finding: 'x', status: 'SUSPECT' },
  ]);
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.deepEqual(Object.keys(result[0]), ['file', 'line', 'severity', 'finding', 'status']);
});

// ─── backward compatibility: existing fixtures gain no status key ────────────

test('Given existing fixtures without status prefixes, when normalizeFindings runs, then results are unchanged and carry no status key', () => {
  const sut = normalizeFindings;

  const fromArray = sut(readFixture('array.json'));
  const fromLine = sut(readFixture('per-line.txt'));
  const fromMixed = sut(readFixture('mixed-whitespace.txt'));

  assert.deepEqual(fromArray, EXPECTED_FINDINGS);
  assert.deepEqual(fromLine, EXPECTED_FINDINGS);
  assert.deepEqual(fromMixed, EXPECTED_FINDINGS);
  assert.ok(!('status' in fromArray[0]));
  assert.ok(!('status' in fromLine[0]));
  assert.ok(!('status' in fromMixed[0]));
});

// ─── disambiguation matrix: status-shaped words that are actually severities ──

test('Given a line starting with INFO (not a status token), when normalizeFindings runs, then severity is INFO and no status is set', () => {
  const raw = 'INFO src/x.js:1 — some info finding';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].severity, 'INFO');
  assert.ok(!('status' in result[0]));
});

test('Given a line starting with PROBE but no trailing colon, when normalizeFindings runs, then severity is PROBE and no status is set', () => {
  const raw = 'PROBE src/x.js:1 — check this path';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].severity, 'PROBE');
  assert.ok(!('status' in result[0]));
});

test('Given a finding whose text contains a status-shaped word mid-line, when normalizeFindings runs, then it is not treated as a status prefix (anchored match)', () => {
  const raw = 'error a.js:1 — please check VERIFIED: manually';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].severity, 'error');
  assert.equal(result[0].finding, 'please check VERIFIED: manually');
  assert.ok(!('status' in result[0]));
});

test('Given a status prefix followed by multiple spaces, when normalizeFindings runs, then the status is still peeled correctly', () => {
  const raw = 'SUSPECT:   HIGH a.js:1 — something odd';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].status, 'SUSPECT');
  assert.equal(result[0].severity, 'HIGH');
  assert.equal(result[0].finding, 'something odd');
});

// ─── ReDoS resistance still holds with a status prefix ───────────────────────

test('Given a status-prefixed pathological line, when normalizeFindings runs, then it rejects promptly without catastrophic backtracking', () => {
  const raw = `VERIFIED: error a.js:1 — ${' '.repeat(5000)}|`;
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /Cannot parse findings/,
  );
});

// ─── malformed → throws ───────────────────────────────────────────────────────

test('Given a malformed fixture, when normalizeFindings runs, then it throws on structurally unrecoverable input', () => {
  const raw = readFixture('malformed.txt');
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /Cannot parse findings/,
  );
});

test('Given JSON-ish input that is invalid JSON, when normalizeFindings runs, then it throws the uniform parse error', () => {
  const raw = '[{"file": "a.js", ';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /Cannot parse findings/,
  );
});

test('Given a JSON array with a missing required field (file), when normalizeFindings runs, then it throws', () => {
  const raw = JSON.stringify([{ line: 1, severity: 'error', finding: 'Bad' }]);
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /Finding at index 0 missing required field/,
  );
});

// ─── ReDoS resistance: pathological trailing-space-then-pipe input ────────────

test('Given a per-line input with thousands of spaces before a lone pipe, when normalizeFindings runs, then it rejects promptly without catastrophic backtracking', () => {
  // A regression guard: the prior combined lazy-quantifier + optional-group pattern
  // backtracked super-linearly on this shape (700 chars ≈ 2s). If it regresses, this
  // test hangs the runner rather than completing.
  const raw = `error a.js:1 — ${' '.repeat(5000)}|`;
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /Cannot parse findings/,
  );
});

// ─── bare pipe in finding/fix is rejected (preserves [^|] semantics) ──────────

test('Given a per-line finding containing a bare pipe, when normalizeFindings runs, then it throws (finding may not contain a pipe)', () => {
  const raw = 'error a.js:1 — left|right';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /Cannot parse findings/,
  );
});

// ─── long unparseable line is truncated in the error message ─────────────────

test('Given a long unparseable line, when normalizeFindings runs, then the thrown message truncates the echoed content', () => {
  const longGarbage = `x${'y'.repeat(500)}`;
  const sut = normalizeFindings;

  assert.throws(
    () => sut(longGarbage),
    (err) => err.message.includes('…') && !err.message.includes('y'.repeat(200)),
  );
});

// ─── parseScopeSpec ───────────────────────────────────────────────────────────

test('Given an empty scope spec, when parseScopeSpec runs, then it returns []', () => {
  const sut = parseScopeSpec;

  const result = sut('');

  assert.deepEqual(result, []);
});

test('Given a single-range scope spec, when parseScopeSpec runs, then it returns one ScopeRange', () => {
  const sut = parseScopeSpec;

  const result = sut('src/a.js:3-9');

  assert.deepEqual(result, [{ file: 'src/a.js', start: 3, end: 9 }]);
});

test('Given a scope spec with two ranges on the same file, when parseScopeSpec runs, then it returns both ranges in order', () => {
  const sut = parseScopeSpec;

  const result = sut('src/a.js:3-9,src/a.js:20-25');

  assert.deepEqual(result, [
    { file: 'src/a.js', start: 3, end: 9 },
    { file: 'src/a.js', start: 20, end: 25 },
  ]);
});

test('Given a scope spec spanning multiple files, when parseScopeSpec runs, then it returns one range per file in order', () => {
  const sut = parseScopeSpec;

  const result = sut('src/a.js:3-9,src/b.js:1-2');

  assert.deepEqual(result, [
    { file: 'src/a.js', start: 3, end: 9 },
    { file: 'src/b.js', start: 1, end: 2 },
  ]);
});

for (const entry of ['a.js:3', 'a.js:x-9', 'a.js:9-3', 'a.js:0-3']) {
  test(`Given a malformed scope entry "${entry}", when parseScopeSpec runs, then it throws naming the entry`, () => {
    const sut = parseScopeSpec;

    assert.throws(
      () => sut(entry),
      (err) => err.message === `malformed scope entry: "${entry}"`,
    );
  });
}

// ─── filterFindings ───────────────────────────────────────────────────────────

function scopedFinding(file, line) {
  return { file, line, severity: 'error', finding: 'x' };
}

test('Given findings on, below, and above a range boundary, when filterFindings runs, then only the in-range boundary findings are kept', () => {
  const sut = filterFindings;
  const ranges = [{ file: 'a.js', start: 5, end: 10 }];
  const findings = [
    scopedFinding('a.js', 4),
    scopedFinding('a.js', 5),
    scopedFinding('a.js', 10),
    scopedFinding('a.js', 11),
  ];

  const result = sut(findings, ranges);

  assert.deepEqual(result, [findings[1], findings[2]]);
});

test('Given a finding whose file matches no range, when filterFindings runs, then it is dropped', () => {
  const sut = filterFindings;
  const ranges = [{ file: 'a.js', start: 1, end: 10 }];
  const findings = [scopedFinding('b.js', 5)];

  const result = sut(findings, ranges);

  assert.deepEqual(result, []);
});

test('Given findings interleaved across matching and non-matching files, when filterFindings runs, then the kept findings preserve input order', () => {
  const sut = filterFindings;
  const ranges = [
    { file: 'a.js', start: 1, end: 10 },
    { file: 'c.js', start: 1, end: 10 },
  ];
  const findings = [
    scopedFinding('a.js', 3),
    scopedFinding('b.js', 3),
    scopedFinding('c.js', 3),
  ];

  const result = sut(findings, ranges);

  assert.deepEqual(result, [findings[0], findings[2]]);
});

// ─── property lens: subset, order-preserving, idempotent ─────────────────────

test('Given generated findings and range sets, when filterFindings runs, then the result is an order-preserving subset of the input and re-filtering is a no-op', () => {
  const sut = filterFindings;
  const files = ['a.js', 'b.js'];
  const findings = [];
  for (const file of files) {
    for (let line = 1; line <= 6; line += 1) {
      findings.push(scopedFinding(file, line));
    }
  }
  const rangeSets = [
    [],
    [{ file: 'a.js', start: 2, end: 4 }],
    [{ file: 'a.js', start: 2, end: 4 }, { file: 'b.js', start: 1, end: 2 }],
    [{ file: 'a.js', start: 1, end: 6 }, { file: 'b.js', start: 1, end: 6 }],
  ];

  for (const ranges of rangeSets) {
    const result = sut(findings, ranges);

    let cursor = 0;
    for (const kept of result) {
      const idx = findings.indexOf(kept, cursor);
      assert.ok(idx !== -1, `kept finding out of order for ranges ${JSON.stringify(ranges)}`);
      cursor = idx + 1;
    }

    assert.deepEqual(sut(result, ranges), result, `not idempotent for ranges ${JSON.stringify(ranges)}`);
  }
});
