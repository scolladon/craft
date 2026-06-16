import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { normalizeFindings } from '../src/findings.js';

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
