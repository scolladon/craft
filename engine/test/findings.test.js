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

// ─── interior blank lines are skipped, not just leading/trailing ones ────────
// Kills the blank-filter mutants in parseLineShape (the `.filter()` call
// dropped, the predicate forced `true`, `.trim()` dropped from the predicate,
// and the empty-string sentinel swapped): each variant would either crash on
// the blank line or misreport how many findings survive it.

test('Given a per-line input with an interior empty line, when normalizeFindings runs, then it is skipped and both real findings survive', () => {
  const raw = 'HIGH a.js:1 — first\n\nHIGH b.js:2 — second';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result.length, 2);
  assert.equal(result[0].finding, 'first');
  assert.equal(result[1].finding, 'second');
});

test('Given a per-line input with an interior whitespace-only line, when normalizeFindings runs, then it is skipped and both real findings survive', () => {
  const raw = 'HIGH a.js:1 — first\n   \nHIGH b.js:2 — second';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result.length, 2);
  assert.equal(result[0].finding, 'first');
  assert.equal(result[1].finding, 'second');
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

test('Given a JSON finding value padded with whitespace, when normalizeFindings runs, then finding is trimmed', () => {
  const raw = JSON.stringify([
    { file: 'src/x.js', line: 1, severity: 'info', finding: '  padded finding  ' },
  ]);
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].finding, 'padded finding');
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

// Kills the MethodExpression mutant (`line.trim()` dropped in parseLine): only
// a non-first line carries whitespace `parseLineShape` never strips (the
// blank-line filter only excludes lines that are ENTIRELY whitespace). Without
// the per-line trim, the status-prefix pattern's leading `^` anchor cannot see
// past the indentation, so the status is missed and the line-head match fails
// on the now-unstripped text.
test('Given a non-first line indented before its status prefix, when normalizeFindings runs, then the status is still peeled correctly', () => {
  const raw = 'HIGH a.js:1 — first\n  VERIFIED: HIGH b.js:2 — second';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result.length, 2);
  assert.equal(result[1].status, 'VERIFIED');
  assert.equal(result[1].severity, 'HIGH');
  assert.equal(result[1].file, 'b.js');
  assert.equal(result[1].finding, 'second');
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

// Kills the Regex mutant (LINE_HEAD_PATTERN's leading `^` anchor removed):
// with no anchor, the pattern could match starting anywhere in the line,
// letting leading noise before a well-formed record through.
test('Given a line with leading token noise before an otherwise well-formed record, when normalizeFindings runs, then it throws rather than matching mid-line', () => {
  const raw = 'a b HIGH x.js:1 — f';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /Cannot parse findings/,
  );
});

// Kills the Regex mutant dropping LINE_HEAD_PATTERN's trailing `$` anchor: `.`
// excludes line terminators (CR, LF, and the Unicode line/paragraph separators),
// and parseLineShape only splits records on LF — so an interior CR survives
// into this pattern. Without the anchor, the greedy `(.*\S)` group would stop
// at the CR and silently truncate the finding instead of the whole record
// failing to parse.
test('Given a per-line finding with an interior carriage return, when normalizeFindings runs, then it throws rather than truncating the finding at the CR', () => {
  const raw = 'HIGH a.js:1 — some\rmore';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /Cannot parse findings/,
  );
});

// Kills the Regex mutant narrowing LINE_HEAD_PATTERN's final `\s+` to `\s`:
// a whitespace run after the separator, containing more than one character
// including a `\r`, needs the `+` to consume it all — a single-character `\s`
// only consumes the first one and fails to match the rest.
test('Given a per-line finding with a mixed-whitespace run containing a carriage return after the separator, when normalizeFindings runs, then it still parses', () => {
  const raw = 'HIGH a.js:1 — \rfinding';
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.equal(result[0].finding, 'finding');
});

test('Given JSON-ish input that is invalid JSON, when normalizeFindings runs, then it throws the uniform parse error', () => {
  const raw = '[{"file": "a.js", ';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /Cannot parse findings/,
  );
});

test('Given JSON-ish input that is invalid JSON, when normalizeFindings runs, then the thrown message names the invalid JSON specifically', () => {
  const raw = '[{"file": "a.js", ';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    /invalid JSON/,
  );
});

test('Given JSON-ish input that is invalid JSON, when normalizeFindings runs, then the thrown error carries the original parse error as its cause', () => {
  const raw = '[{"file": "a.js", ';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    (err) => err.cause instanceof Error && err.cause.message.length > 0,
  );
});

test('Given a JSON array item that is null, when normalizeFindings runs, then it throws naming the index and shape', () => {
  const raw = '[null]';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    (err) => err.message === 'Finding at index 0 is not an object',
  );
});

test('Given a JSON array item that is a primitive number, when normalizeFindings runs, then it throws naming the index and shape', () => {
  const raw = '[1]';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    (err) => err.message === 'Finding at index 0 is not an object',
  );
});

test('Given a JSON array with leading whitespace, when normalizeFindings runs, then it still parses as the JSON shape', () => {
  const raw = `  ${JSON.stringify([{ file: 'src/x.js', line: 1, severity: 'info', finding: 'note' }])}`;
  const sut = normalizeFindings;

  const result = sut(raw);

  assert.deepEqual(result, [{ file: 'src/x.js', line: 1, severity: 'info', finding: 'note' }]);
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

// Guards PIPE_DELIMITER's linear-scan contract directly: the two tests above only
// assert the pathological line still gets rejected as malformed — a delimiter that
// scans quadratically produces that identical rejection, just slower, so they would
// stay green through a regression. This asserts scaling instead of an outcome:
// machine-independent (a ratio, not a wall-clock threshold), it compares parse time
// at MAX_LINE_CHARS against parse time at an 8x-smaller input. A linear delimiter's
// cost tracks input length; a quadratic one costs roughly 8x squared as much.
test('Given the same pathological trailing-pipe shape at two input sizes, when normalizeFindings runs on each, then parse time scales sub-quadratically with input length', () => {
  const sut = normalizeFindings;
  const makeRaw = (size) => {
    const prefix = 'error a.js:1 — ';
    return `${prefix}${' '.repeat(size - prefix.length - 1)}|`;
  };
  const timeRun = (size) => {
    const raw = makeRaw(size);
    const start = process.hrtime.bigint();
    assert.throws(() => sut(raw), /line does not match the per-line format/);
    return Number(process.hrtime.bigint() - start) / 1e6;
  };
  const smallSize = Math.floor(MAX_LINE_CHARS / 8);

  timeRun(smallSize); // warm up the engine before measuring
  timeRun(MAX_LINE_CHARS);
  const small = Math.min(timeRun(smallSize), timeRun(smallSize));
  const full = Math.min(timeRun(MAX_LINE_CHARS), timeRun(MAX_LINE_CHARS));

  assert.ok(
    full / small < 20,
    `expected sub-quadratic scaling (ratio < 20 for an 8x input), got ${full / small} `
    + `(small=${small}ms, full=${full}ms)`,
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

// Kills the ConditionalExpression mutant (the truncation check in
// parseLineShape forced permanently true): a short line must echo in full,
// with no ellipsis appended.
test('Given a short unparseable line, when normalizeFindings runs, then the thrown message echoes it in full with no ellipsis', () => {
  const raw = 'not a valid record';
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    (err) => err.message.includes(raw) && !err.message.includes('…'),
  );
});

// Kills the EqualityOperator mutant (parseLineShape's truncation check `>`
// widened to `>=`): a line of exactly 120 characters sits on the boundary and
// must still echo in full, with no ellipsis appended.
test('Given an unparseable line of exactly 120 characters, when normalizeFindings runs, then the thrown message echoes it in full with no ellipsis', () => {
  const raw = 'x'.repeat(120);
  const sut = normalizeFindings;

  assert.throws(
    () => sut(raw),
    (err) => err.message.includes(raw) && !err.message.includes('…'),
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

// A spec built from `readFileSync(specfile, 'utf8')` — unlike the documented
// `$(cat "$specfile")` shell call site — keeps a trailing newline, so the
// split produces a genuinely empty final entry. That entry is a structural
// split artifact, not a malformed one, and must not throw.
test('Given a scope spec with a trailing newline, when parseScopeSpec runs, then the trailing blank entry is skipped and the real entry parses', () => {
  const sut = parseScopeSpec;

  const result = sut('a.js:1-9\n');

  assert.deepEqual(result, [{ file: 'a.js', start: 1, end: 9 }]);
});

test('Given a scope spec that is only a newline, when parseScopeSpec runs, then it returns []', () => {
  const sut = parseScopeSpec;

  const result = sut('\n');

  assert.deepEqual(result, []);
});

test('Given a scope spec that is only whitespace, when parseScopeSpec runs, then it returns []', () => {
  const sut = parseScopeSpec;

  const result = sut('  ');

  assert.deepEqual(result, []);
});

test('Given a scope spec with an interior blank line between two entries, when parseScopeSpec runs, then both entries parse and the blank line is skipped', () => {
  const sut = parseScopeSpec;

  const result = sut('a.js:1-9\n\nb.js:1-9');

  assert.deepEqual(result, [
    { file: 'a.js', start: 1, end: 9 },
    { file: 'b.js', start: 1, end: 9 },
  ]);
});

test('Given a single-range scope spec, when parseScopeSpec runs, then it returns one ScopeRange', () => {
  const sut = parseScopeSpec;

  const result = sut('src/a.js:3-9');

  assert.deepEqual(result, [{ file: 'src/a.js', start: 3, end: 9 }]);
});

test('Given a scope spec with two ranges on the same file, when parseScopeSpec runs, then it returns both ranges in order', () => {
  const sut = parseScopeSpec;

  const result = sut('src/a.js:3-9\nsrc/a.js:20-25');

  assert.deepEqual(result, [
    { file: 'src/a.js', start: 3, end: 9 },
    { file: 'src/a.js', start: 20, end: 25 },
  ]);
});

test('Given a scope spec spanning multiple files, when parseScopeSpec runs, then it returns one range per file in order', () => {
  const sut = parseScopeSpec;

  const result = sut('src/a.js:3-9\nsrc/b.js:1-2');

  assert.deepEqual(result, [
    { file: 'src/a.js', start: 3, end: 9 },
    { file: 'src/b.js', start: 1, end: 2 },
  ]);
});

// A path may legally contain a comma but can never contain a newline. The
// retired comma-joined form now arrives as a single entry: the greedy
// SCOPE_ENTRY_PATTERN still finds a valid-looking range at the tail, so
// without a guard it would absorb everything before it — including the other
// "entries" and their own commas — into one garbage file name that matches
// nothing, dropping every finding for it in silence. The swallowed-entry guard
// rejects that shape instead.
test('Given the retired comma-joined range form as a single-argument spec, when parseScopeSpec runs, then it throws naming the whole entry', () => {
  const sut = parseScopeSpec;

  assert.throws(
    () => sut('a.js:1-9, b.js:1-9'),
    (err) => err.message === 'malformed scope entry: "a.js:1-9, b.js:1-9"',
  );
});

test('Given the retired comma-joined whole-file form as a single-argument spec, when parseScopeSpec runs, then it throws naming the whole entry', () => {
  const sut = parseScopeSpec;

  assert.throws(
    () => sut('a.js:*, b.js:*'),
    (err) => err.message === 'malformed scope entry: "a.js:*, b.js:*"',
  );
});

test('Given a comma-bearing path as a single-entry spec, when parseScopeSpec runs, then it returns one range for that path', () => {
  const sut = parseScopeSpec;

  const result = sut('a,b.js:1-9');

  assert.deepEqual(result, [{ file: 'a,b.js', start: 1, end: 9 }]);
});

// The zero-space form is the literal output of the retired `entries.join(',')`
// (no space after the separator) — the most likely real arrival, though every
// other swallowed-entry test above puts a space after the comma.
test('Given the zero-space comma-joined range form as a single-argument spec, when parseScopeSpec runs, then it throws naming the whole entry', () => {
  const sut = parseScopeSpec;

  assert.throws(
    () => sut('a.js:1-9,b.js:1-9'),
    (err) => err.message === 'malformed scope entry: "a.js:1-9,b.js:1-9"',
  );
});

test('Given the zero-space comma-joined whole-file form as a single-argument spec, when parseScopeSpec runs, then it throws naming the whole entry', () => {
  const sut = parseScopeSpec;

  assert.throws(
    () => sut('a.js:1-9,b.js:*'),
    (err) => err.message === 'malformed scope entry: "a.js:1-9,b.js:*"',
  );
});

// The swallowed-entry guard must not fire on the two forms this run
// deliberately preserves: a colon-bearing path with no range, and a range
// with no trailing comma.
test('Given a colon-bearing whole-file path with no range, when parseScopeSpec runs, then it still parses as a whole-file grant', () => {
  const sut = parseScopeSpec;

  const result = sut('C:\\repo\\a.js:*');

  assert.deepEqual(result, [{ file: 'C:\\repo\\a.js', start: 0, end: Number.MAX_SAFE_INTEGER }]);
});

test('Given a colon-bearing path with a range, when parseScopeSpec runs, then it still parses to that range', () => {
  const sut = parseScopeSpec;

  const result = sut('C:\\repo\\a.js:1-9');

  assert.deepEqual(result, [{ file: 'C:\\repo\\a.js', start: 1, end: 9 }]);
});

test('Given a path containing a range-shaped substring with no trailing comma, when parseScopeSpec runs, then it still parses as a whole-file grant', () => {
  const sut = parseScopeSpec;

  const result = sut('notes:1-9.txt:*');

  assert.deepEqual(result, [{ file: 'notes:1-9.txt', start: 0, end: Number.MAX_SAFE_INTEGER }]);
});

// Kills the Regex mutants narrowing SWALLOWED_ENTRY_PATTERN's
// digit runs to a single digit (`\d+` → `\d`, either side of the hyphen): a
// swallowed entry whose range uses multi-digit numbers on both sides would
// slip past a guard that only recognises a single leading or trailing digit.
test('Given the retired comma-joined form with multi-digit range numbers, when parseScopeSpec runs, then it still throws naming the whole entry', () => {
  const sut = parseScopeSpec;

  assert.throws(
    () => sut('a.js:10-99, b.js:1-9'),
    (err) => err.message === 'malformed scope entry: "a.js:10-99, b.js:1-9"',
  );
});

// Kills the Regex mutant widening SWALLOWED_ENTRY_PATTERN's pre-comma
// whitespace class to `\S*` (non-whitespace): a swallowed entry with a space
// before the comma would slip past a guard that requires the comma to sit
// directly against the range-or-star tail.
test('Given the retired comma-joined form with a space before the comma, when parseScopeSpec runs, then it still throws naming the whole entry', () => {
  const sut = parseScopeSpec;

  assert.throws(
    () => sut('a.js:1-9 , b.js:1-9'),
    (err) => err.message === 'malformed scope entry: "a.js:1-9 , b.js:1-9"',
  );
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

// parseScopeSpec splits the whole spec on plain `\n` before matching any
// entry, so a `\n`-separated entry can never reach SCOPE_ENTRY_PATTERN. What
// this pins is the split point itself: `junk` is a whole entry in its own
// right, and it is rejected on its own merits, independent of the well-formed
// entry that follows the newline.
test('Given a scope spec with a newline separating a malformed entry from a well-formed one, when parseScopeSpec runs, then it throws naming the malformed entry', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('junk\na.js:1-9'), (err) => err.message === 'malformed scope entry: "junk"');
});

// Kills the Regex mutant removing SCOPE_ENTRY_PATTERN's trailing `$` anchor:
// with no anchor, `.+` could match a truncated prefix and let trailing garbage
// after a valid-looking range through silently.
test('Given a scope entry with garbage trailing a valid-looking range, when parseScopeSpec runs, then it is rejected rather than accepted as a truncated prefix', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('a.js:1-9extra'), /malformed scope entry/u);
});

// Kills the Regex mutant removing SCOPE_ENTRY_PATTERN's leading `^` anchor.
// `.` excludes line terminators (CR, LF, and the Unicode line/paragraph
// separators), while parseScopeSpec only splits entries on plain LF — so an
// interior CR reaches this pattern still attached to the junk before it. The
// anchor is what stops an unanchored `.+` hiding that prefix.
test('Given a scope entry with junk before an interior carriage return, when parseScopeSpec runs, then it throws rather than silently discarding the junk prefix', () => {
  const sut = parseScopeSpec;

  assert.throws(
    () => sut('junk\ra.js:1-9'),
    (err) => err.message === 'malformed scope entry: "junk\ra.js:1-9"',
  );
});

// Same split-point reasoning as SCOPE_ENTRY_PATTERN above: parseScopeSpec
// never hands WHOLE_FILE_ENTRY_PATTERN an entry containing a plain-LF
// newline, so this pins that `junk` is rejected as its own entry rather than
// proving the `^` anchor stops a later match.
test('Given a scope spec with a newline separating a malformed entry from a whole-file entry, when parseScopeSpec runs, then it throws naming the malformed entry', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('junk\na.js:*'), (err) => err.message === 'malformed scope entry: "junk"');
});

// Kills the Regex mutant removing WHOLE_FILE_ENTRY_PATTERN's trailing `$`
// anchor: with no anchor, `.+` could match a truncated prefix and let garbage
// after the `*` marker through silently.
test('Given a whole-file entry with garbage trailing the "*" marker, when parseScopeSpec runs, then it is rejected rather than accepted as a truncated prefix', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('a.js:*extra'), /malformed scope entry/u);
});

// Kills the Regex mutant removing WHOLE_FILE_ENTRY_PATTERN's leading `^`
// anchor: same CR-survives-`.` reasoning as SCOPE_ENTRY_PATTERN above, with a
// worse blast radius — an unanchored match would grant the whole file from junk.
test('Given a whole-file entry with junk before an interior carriage return, when parseScopeSpec runs, then it throws rather than granting the whole file from garbage', () => {
  const sut = parseScopeSpec;

  assert.throws(
    () => sut('junk\ra.js:*'),
    (err) => err.message === 'malformed scope entry: "junk\ra.js:*"',
  );
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

test('Given a scope spec with spaces after its newlines, when parsed, then every entry is still recognised', () => {
  const sut = parseScopeSpec;

  const result = sut('a.js:1-9\n b.js:2-4 \n\tc.js:3-3');

  assert.deepEqual(result, [
    { file: 'a.js', start: 1, end: 9 },
    { file: 'b.js', start: 2, end: 4 },
    { file: 'c.js', start: 3, end: 3 },
  ]);
});

test('Given an entry that is only whitespace, when the spec is parsed, then it is rejected as malformed', () => {
  const sut = parseScopeSpec;

  assert.throws(() => sut('a.js:1-9\n   '), /malformed scope entry/u);
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

// Kills the ConditionalExpression + StringLiteral mutants in filterFindings's
// repoRoot default (`repoRoot !== ''` forced true / compared against a
// sentinel instead of ''). With no repoRoot supplied (the '' default), an
// absolute finding path must be left exactly as-is — never have its leading
// slash silently stripped as if a repo root were in effect.
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
