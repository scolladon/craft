import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const bin = join(__dir, '..', 'bin', 'normalize-findings.js');

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));
function writeTmp(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'normfind-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

function runStdin(input) {
  return spawnSync(process.execPath, [bin], { input, encoding: 'utf8' });
}

// Concrete pair (fix present): both shapes must normalize to the same byte string.
const JSON_INPUT = JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', fix: 'y' }]);
const LINE_INPUT = 'HIGH a.js:3 — x | y';
const EXPECTED = JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', fix: 'y' }], null, 2) + '\n';

// Concrete pair (fix absent): the `fix` key must be genuinely absent in both shapes.
const JSON_NOFIX = JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' }]);
const LINE_NOFIX = 'HIGH a.js:3 — x';
const EXPECTED_NOFIX = JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' }], null, 2) + '\n';

// Status trio: same finding, both shapes carry a status field emitted after fix.
const LINE_STATUS = 'RULED-OUT: HIGH a.js:3 — x | y';
const JSON_STATUS = JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', fix: 'y', status: 'RULED-OUT' }]);
const EXPECTED_STATUS = JSON.stringify([{ file: 'a.js', line: 3, severity: 'HIGH', finding: 'x', fix: 'y', status: 'RULED-OUT' }], null, 2) + '\n';

// ─── (a) JSON-array stdin → exact canonical bytes, exit 0 ────────────────────

test('Given a JSON-array input on stdin, when normalize-findings runs, then it prints the exact canonical bytes and exits 0', () => {
  const sut = runStdin;

  const result = sut(JSON_INPUT);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, EXPECTED);
});

// ─── (b) per-line stdin → byte-identical canonical bytes, exit 0 ─────────────

test('Given a per-line input on stdin, when normalize-findings runs, then it prints byte-identical canonical bytes and exits 0', () => {
  const sut = runStdin;

  const result = sut(LINE_INPUT);

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, EXPECTED);
});

// ─── R10 anchor: both shapes produce byte-identical output ───────────────────

test('Given JSON-array and per-line inputs for the same finding, when normalize-findings runs on each, then stdout is byte-identical (R10)', () => {
  const sut = runStdin;

  const fromJson = sut(JSON_INPUT);
  const fromLine = sut(LINE_INPUT);

  assert.equal(fromJson.status, 0, `JSON stderr: ${fromJson.stderr}`);
  assert.equal(fromLine.status, 0, `per-line stderr: ${fromLine.stderr}`);
  assert.equal(fromJson.stdout, fromLine.stdout);
});

// ─── fix-absent: both shapes byte-identical, `fix` key genuinely absent ──────

test('Given fix-absent inputs in both shapes, when normalize-findings runs, then stdout is byte-identical and omits the fix key', () => {
  const sut = runStdin;

  const fromJson = sut(JSON_NOFIX);
  const fromLine = sut(LINE_NOFIX);

  assert.equal(fromJson.stdout, EXPECTED_NOFIX);
  assert.equal(fromLine.stdout, EXPECTED_NOFIX);
  assert.ok(!fromJson.stdout.includes('"fix"'), 'fix key must be absent when no fix is given');
});

// ─── status field: both shapes byte-identical, emitted after fix ────────────

test('Given JSON and per-line stdin inputs carrying a status field, when normalize-findings runs on each, then stdout is byte-identical canonical bytes with status emitted after fix', () => {
  const sut = runStdin;

  const fromJson = sut(JSON_STATUS);
  const fromLine = sut(LINE_STATUS);

  assert.equal(fromJson.status, 0, `JSON stderr: ${fromJson.stderr}`);
  assert.equal(fromLine.status, 0, `per-line stderr: ${fromLine.stderr}`);
  assert.equal(fromJson.stdout, EXPECTED_STATUS);
  assert.equal(fromLine.stdout, EXPECTED_STATUS);
  assert.ok(fromJson.stdout.includes('"status": "RULED-OUT"'), 'status value must appear in the emitted bytes');
  assert.ok(
    fromJson.stdout.indexOf('"fix"') < fromJson.stdout.indexOf('"status"'),
    'status must be emitted after fix (key-order pin)',
  );
});

// ─── (c) per-line garbage → stderr message, exit 2, no stdout ────────────────

test('Given structurally-unrecoverable per-line garbage on stdin, when normalize-findings runs, then it writes stderr and exits 2', () => {
  const sut = runStdin;

  const result = sut('not valid findings at all !!');

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('normalize-findings:'), `stderr was: ${result.stderr}`);
  assert.equal(result.stdout, '');
});

// ─── JSON-path garbage (starts with '[') → exit 2 ────────────────────────────

test('Given malformed JSON that starts with "[" on stdin, when normalize-findings runs, then it exits 2 via the JSON parse branch', () => {
  const sut = runStdin;

  const result = sut('[not valid json');

  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes('normalize-findings:'), `stderr was: ${result.stderr}`);
});

// ─── file-path mode → byte-identical to stdin mode ───────────────────────────

test('Given a file-path argument, when normalize-findings runs, then it reads the file and prints the same canonical bytes as stdin mode', () => {
  const path = writeTmp('findings.json', JSON_INPUT);
  const sut = spawnSync;

  const result = sut(process.execPath, [bin, path], { encoding: 'utf8' });

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.stdout, EXPECTED);
});

// ─── nonexistent file path → clean stderr + exit 2 (not a raw stack trace) ───

test('Given a nonexistent file-path argument, when normalize-findings runs, then it exits 2 with a clean message', () => {
  const sut = spawnSync;

  const result = sut(process.execPath, [bin, '/no/such/findings/file.json'], { encoding: 'utf8' });

  assert.equal(result.status, 2, `expected clean exit 2; stderr: ${result.stderr}`);
  assert.ok(result.stderr.includes('normalize-findings:'), `stderr should be the clean bin message; got: ${result.stderr}`);
  assert.equal(result.stdout, '');
});
