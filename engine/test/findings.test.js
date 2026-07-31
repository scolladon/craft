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

// Mirrors the module-private cap in ../src/findings.js. Declared independently
// (not imported) so a drift between the two fails loudly on a message assertion
// rather than silently.
const MAX_LINE_CHARS = 16384;

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

test('Given a status-prefixed pathological line at exactly the cap, when normalizeFindings runs, then it rejects promptly as malformed rather than tripping the cap', () => {
  const prefix = 'VERIFIED: error a.js:1 — ';
  const raw = `${prefix}${' '.repeat(MAX_LINE_CHARS - prefix.length - 1)}|`;
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /line does not match the per-line format/,
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

test('Given a per-line input at exactly the cap with a lone trailing pipe, when normalizeFindings runs, then it rejects promptly as malformed rather than tripping the cap', () => {
  // A regression guard: the prior combined lazy-quantifier + optional-group pattern
  // backtracked super-linearly on this shape. Sized to the cap itself (not beyond it)
  // so this still exercises the split path — the cap must not intercept it first.
  const prefix = 'error a.js:1 — ';
  const raw = `${prefix}${' '.repeat(MAX_LINE_CHARS - prefix.length - 1)}|`;
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /line does not match the per-line format/,
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

// ─── directed delimiter table: pins today's pipe-delimiter behaviour case by
// case, so a later delimiter rewrite can be checked against it unchanged ─────

const DELIMITER_CASES = [
  {
    name: 'no fix',
    raw: 'HIGH a.js:1 — some finding',
    expected: { file: 'a.js', line: 1, severity: 'HIGH', finding: 'some finding' },
  },
  {
    name: 'one fix',
    raw: 'HIGH a.js:1 — some finding | do the fix',
    expected: { file: 'a.js', line: 1, severity: 'HIGH', finding: 'some finding', fix: 'do the fix' },
  },
  {
    name: 'multiple spaces around the pipe',
    raw: 'HIGH a.js:1 — some finding    |    do the fix',
    expected: { file: 'a.js', line: 1, severity: 'HIGH', finding: 'some finding', fix: 'do the fix' },
  },
  {
    name: 'a tab-delimited pipe',
    raw: 'HIGH a.js:1 — some finding\t|\tdo the fix',
    expected: { file: 'a.js', line: 1, severity: 'HIGH', finding: 'some finding', fix: 'do the fix' },
  },
  {
    name: 'a status prefix plus a fix',
    raw: 'VERIFIED: HIGH a.js:1 — some finding | do the fix',
    expected: {
      file: 'a.js', line: 1, severity: 'HIGH', finding: 'some finding', fix: 'do the fix', status: 'VERIFIED',
    },
  },
  {
    name: 'two delimiters',
    raw: 'HIGH a.js:1 — some finding | fix one | fix two',
    throws: true,
  },
  {
    name: 'a pipe inside the finding',
    raw: 'HIGH a.js:1 — some|finding',
    throws: true,
  },
  {
    name: 'a pipe inside the fix',
    raw: 'HIGH a.js:1 — some finding | do this|that',
    throws: true,
  },
  {
    name: 'a pipe with no leading space',
    raw: 'HIGH a.js:1 — some finding| do the fix',
    throws: true,
  },
  {
    name: 'a pipe with no trailing space',
    raw: 'HIGH a.js:1 — some finding |do the fix',
    throws: true,
  },
  {
    name: 'adjacent delimited pipes',
    raw: 'HIGH a.js:1 — a | | b',
    throws: true,
  },
  {
    name: 'trailing whitespace in the fix',
    raw: 'HIGH a.js:1 — some finding | do the fix   ',
    expected: { file: 'a.js', line: 1, severity: 'HIGH', finding: 'some finding', fix: 'do the fix' },
  },
  {
    name: 'an en-dash separator',
    raw: 'HIGH a.js:1 – some finding | do the fix',
    expected: { file: 'a.js', line: 1, severity: 'HIGH', finding: 'some finding', fix: 'do the fix' },
  },
  {
    name: 'multiple spaces around the separator',
    raw: 'HIGH  a.js:1   —   some finding | do the fix',
    expected: { file: 'a.js', line: 1, severity: 'HIGH', finding: 'some finding', fix: 'do the fix' },
  },
];

for (const { name, raw, expected, throws } of DELIMITER_CASES) {
  const behaviour = throws ? 'throws' : 'parses to the pinned shape';
  test(`Given a per-line record with ${name}, when normalizeFindings runs, then it ${behaviour}`, () => {
    const sut = normalizeFindings;

    if (throws) {
      assert.throws(() => sut(raw), /Cannot parse findings/);
    } else {
      const result = sut(raw);
      assert.deepEqual(result, [expected]);
    }
  });
}

// ─── per-line cap: a line longer than MAX_LINE_CHARS is rejected as oversized,
// never as malformed ───────────────────────────────────────────────────────────

test('Given a per-line record one character over the cap, when normalizeFindings runs, then it throws naming the cap and the actual length', () => {
  const prefix = 'error a.js:1 — ';
  const filler = ' '.repeat(MAX_LINE_CHARS + 1 - prefix.length - 1);
  const raw = `${prefix}${filler}|`;
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    (err) => new RegExp(`line exceeds the ${MAX_LINE_CHARS}-character cap`).test(err.message)
      && err.message.includes(`(${raw.length} characters)`),
  );
});

test('Given a well-formed per-line record of exactly MAX_LINE_CHARS characters, when normalizeFindings runs, then it parses successfully', () => {
  const prefix = 'error a.js:1 — ';
  const finding = 'x'.repeat(MAX_LINE_CHARS - prefix.length);
  const raw = `${prefix}${finding}`;
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result.length, 1);
  assert.equal(result[0].finding, finding);
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

// Kills the Regex mutants at findings.js:34 (SCOPE_ENTRY_PATTERN's `^`/`$` anchors
// removed). `.` never matches `\n`, so an anchored pattern cannot match a
// range-shaped suffix that only appears after an embedded newline, and cannot
// match past a `$` when garbage trails the range — an unanchored pattern would
// silently accept both instead of rejecting them.
test('Given a scope entry with an embedded newline before the range-shaped part, when parseScopeSpec runs, then it is rejected rather than matched from a later position', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('junk\na.js:1-9'), /malformed scope entry/u);
});

test('Given a scope entry with garbage trailing a valid-looking range, when parseScopeSpec runs, then it is rejected rather than accepted as a truncated prefix', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('a.js:1-9extra'), /malformed scope entry/u);
});

// Kills the Regex mutants at findings.js:38 (WHOLE_FILE_ENTRY_PATTERN's `^`/`$`
// anchors removed) — same reasoning as SCOPE_ENTRY_PATTERN above.
test('Given a whole-file entry with an embedded newline before the marker, when parseScopeSpec runs, then it is rejected rather than matched from a later position', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('junk\na.js:*'), /malformed scope entry/u);
});

test('Given a whole-file entry with garbage trailing the "*" marker, when parseScopeSpec runs, then it is rejected rather than accepted as a truncated prefix', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('a.js:*extra'), /malformed scope entry/u);
});

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

test('Given a scope spec with spaces after its commas, when parsed, then every entry is still recognised', () => {
  const sut = parseScopeSpec;

  const result = sut('a.js:1-9, b.js:2-4 ,\tc.js:3-3');

  assert.deepEqual(result, [
    { file: 'a.js', start: 1, end: 9 },
    { file: 'b.js', start: 2, end: 4 },
    { file: 'c.js', start: 3, end: 3 },
  ]);
});

test('Given an entry that is only whitespace, when the spec is parsed, then it is rejected as malformed', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('a.js:1-9,   '), /malformed scope entry/u);
});

test('Given findings whose paths carry a leading dot-slash, when filtered against a bare-path range, then they are kept', () => {
  const sut = filterFindings;
  const findings = [{ file: './engine/src/glob.js', line: 13, severity: 'CRITICAL', finding: 'x' }];

  const result = sut(findings, [{ file: 'engine/src/glob.js', start: 10, end: 20 }]);

  assert.deepEqual(result, findings);
});

test('Given a range whose path carries a leading dot-slash, when filtered against bare-path findings, then they are kept', () => {
  const sut = filterFindings;
  const findings = [{ file: 'engine/src/glob.js', line: 13, severity: 'CRITICAL', finding: 'x' }];

  const result = sut(findings, [{ file: './engine/src/glob.js', start: 10, end: 20 }]);

  assert.deepEqual(result, findings);
});

test('Given findings whose paths differ only by a trailing-slash-free directory prefix, when filtered, then only genuine matches are kept', () => {
  const sut = filterFindings;
  const findings = [
    { file: 'src/glob.js', line: 13, severity: 'HIGH', finding: 'kept' },
    { file: 'other/src/glob.js', line: 13, severity: 'HIGH', finding: 'dropped' },
  ];

  const result = sut(findings, [{ file: 'src/glob.js', start: 10, end: 20 }]);

  assert.deepEqual(result, [findings[0]]);
});

test('Given findings emitted with absolute paths, when filtered against a repo root, then they are matched repo-relatively', () => {
  const sut = filterFindings;
  const findings = [{ file: '/repo/engine/src/glob.js', line: 12, severity: 'CRITICAL', finding: 'x' }];

  const result = sut(findings, [{ file: 'engine/src/glob.js', start: 10, end: 20 }], '/repo');

  assert.deepEqual(result, findings);
});

// Kills the ConditionalExpression + StringLiteral mutants at findings.js:258
// (`repoRoot !== ''` forced true / compared against a sentinel instead of '').
// With no repoRoot supplied (the '' default), an absolute finding path must be
// left exactly as-is — never have its leading slash silently stripped as if a
// repo root were in effect.
test('Given an absolute finding path with no repo root supplied, when filtered against a bare-path range, then it is not matched (no silent relativization)', () => {
  const sut = filterFindings;
  const findings = [{ file: '/engine/src/glob.js', line: 13, severity: 'HIGH', finding: 'x' }];

  const result = sut(findings, [{ file: 'engine/src/glob.js', start: 10, end: 20 }]);

  assert.deepEqual(result, []);
});

test('Given an absolute finding path outside the repo root, when filtered, then it is not matched', () => {
  const sut = filterFindings;
  const findings = [{ file: '/elsewhere/engine/src/glob.js', line: 12, severity: 'CRITICAL', finding: 'x' }];

  const result = sut(findings, [{ file: 'engine/src/glob.js', start: 10, end: 20 }], '/repo');

  assert.deepEqual(result, []);
});

test('Given a whole-file marker, when findings on any line are filtered, then all are kept', () => {
  const sut = filterFindings;
  const findings = [
    { file: 'a.js', line: 1, severity: 'HIGH', finding: 'first' },
    { file: 'a.js', line: 99999, severity: 'LOW', finding: 'far down' },
  ];

  const result = sut(findings, parseScopeSpec('a.js:*'));

  assert.deepEqual(result, findings);
});

test('Given an entry with a malformed range, when the spec is parsed, then it is still rejected', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('a.js:9-1'), /malformed scope entry/u);
});

test('Given a colon-free entry, when the spec is parsed, then it is rejected rather than silently granting the whole file', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('a.js'), /malformed scope entry/u);
  assert.throws(() => sut('-9'), /malformed scope entry/u);
});

test('Given an explicit whole-file marker, when the spec is parsed, then it covers every line including line zero', () => {
  const sut = parseScopeSpec;

  const result = sut('engine/src/glob.js:*');

  assert.deepEqual(result, [{ file: 'engine/src/glob.js', start: 0, end: Number.MAX_SAFE_INTEGER }]);
});

test('Given a file-scoped finding reported at line zero, when filtered against a whole-file marker, then it is kept', () => {
  const sut = filterFindings;
  const findings = [{ file: 'a.js', line: 0, severity: 'CRITICAL', finding: 'hardcoded key' }];

  const result = sut(findings, parseScopeSpec('a.js:*'));

  assert.deepEqual(result, findings);
});

test('Given whitespace between the path and its range, when the spec is parsed, then the path carries no stray space', () => {
  const sut = parseScopeSpec;

  // Both branches trim: an untrimmed whole-file path would never match anything,
  // which is a silent drop by another route.
  assert.deepEqual(sut('a.js :1-9'), [{ file: 'a.js', start: 1, end: 9 }]);
  assert.deepEqual(sut('a.js :*'), [{ file: 'a.js', start: 0, end: Number.MAX_SAFE_INTEGER }]);
});

test('Given a finding whose file is not a string, when filtered, then it is dropped rather than throwing', () => {
  const sut = filterFindings;

  const result = sut([{ file: 123, line: 5, severity: 'HIGH', finding: 'x' }], parseScopeSpec('a.js:1-9'));

  assert.deepEqual(result, []);
});
