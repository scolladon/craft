/**
 * In-process unit tests for filter-findings-main.
 *
 * Coverage split: same rationale as normalize-findings-main.test.js — stdin
 * (fd 0 read) is excluded from in-process units because opening fd 0
 * in-process conflicts with the test runner's own stdin; that path is
 * covered end-to-end by the child-process smoke in filter-findings-bin.test.js.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/filter-findings-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

function makeIo() {
  const io = makeCaptureIo();
  io.readStdin = () => { throw new Error('readStdin should not be called in file-path mode'); };
  return io;
}

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function writeTmp(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'filterfind-main-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

const FINDINGS_JSON = JSON.stringify([
  { file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' },
  { file: 'a.js', line: 30, severity: 'LOW', finding: 'out of scope' },
], null, 2) + '\n';

const EXPECTED = JSON.stringify([
  { file: 'a.js', line: 3, severity: 'HIGH', finding: 'x' },
], null, 2) + '\n';

// ─── valid input + scope → exit 0, exact scoped canonical bytes ──────────────

test('Given a JSON findings file and a matching --scope, when main runs, then it returns 0 and stdout is the scoped canonical bytes', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.json', FINDINGS_JSON);

  const result = sut([path, '--scope', 'a.js:1-10'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), EXPECTED);
});

// ─── empty findings input → [] and exit 0 ────────────────────────────────────

test('Given an empty findings array file, when main runs, then it returns 0 and stdout is []', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('empty.json', '[]\n');

  const result = sut([path, '--scope', 'a.js:1-10'], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '[]\n');
});

// ─── empty --scope "" → [] and exit 0 (nothing changed → nothing in scope) ──

test('Given a non-empty findings file and an empty --scope, when main runs, then it returns 0 and stdout is [] (nothing is in scope)', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.json', FINDINGS_JSON);

  const result = sut([path, '--scope', ''], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '[]\n');
});

// ─── missing --scope → exit 2 + clean stderr + empty stdout ─────────────────

test('Given no --scope flag, when main runs, then it returns 2 with a clean missing --scope message and no stdout', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.json', FINDINGS_JSON);

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.equal(io.stderr.joined(), 'filter-findings: missing --scope\n');
  assert.equal(io.stdout.joined(), '');
});

// ─── malformed range → exit 2 + clean message naming the entry ──────────────

test('Given a malformed --scope entry, when main runs, then it returns 2 with a clean message naming the entry', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('findings.json', FINDINGS_JSON);

  const result = sut([path, '--scope', 'a.js:9-3'], io);

  assert.equal(result, 2);
  assert.equal(io.stderr.joined(), 'filter-findings: malformed scope entry: "a.js:9-3"\n');
  assert.equal(io.stdout.joined(), '');
});

// ─── nonexistent input path → exit 2, clean, no stack trace ─────────────────

test('Given a nonexistent findings file path, when main runs, then it returns 2 with a clean message and no stack trace', () => {
  const sut = main;
  const io = makeIo();

  const result = sut(['/no/such/findings.json', '--scope', 'a.js:1-10'], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().startsWith('filter-findings: '), `stderr was: ${io.stderr.joined()}`);
  assert.ok(!io.stderr.joined().includes('    at '), 'stderr must not contain a stack trace');
  // Kills the BlockStatement mutant at filter-findings-main.js:86 (the read
  // catch emptied): an emptied catch lets `raw` stay undefined, which still
  // exits 2 but via JSON.parse's error message instead of the real ENOENT —
  // pin the actual read failure, not just "some" clean exit-2 message.
  assert.match(io.stderr.joined(), /ENOENT/u, `expected the real read error, got: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

test('Given --scope as the final argument with no value, when main runs, then it reports the missing value', () => {
  const io = makeIo();

  const result = main(['--scope'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /missing --scope value/u);
});

test('Given a JSON payload that is not an array, when main runs, then it reports the shape rather than an internal error', () => {
  const io = makeIo();
  const path = writeTmp('obj.json', '{"a":1}');

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /findings input must be a JSON array/u);
});

test('Given a non-empty input that filters to nothing, when main runs, then the total drop is announced on stderr', () => {
  const io = makeIo();
  const path = writeTmp('drop.json', JSON.stringify([{ file: 'a.js', line: 2, severity: 'HIGH', finding: 'x' }]));

  const result = main([path, '--scope', 'b.js:1-9'], io);

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /1 of 1 finding\(s\) fell outside the scope/u);
  assert.ok(!io.stderr.joined().includes('and 0 more'), io.stderr.joined());
  // Kills the StringLiteral mutants at :124 (`file.startsWith('/')` → `startsWith("")`,
  // always true) and :126 (the empty else-branch replaced with a sentinel): a
  // RELATIVE dropped path must carry no absolute-path hint at all.
  assert.equal(
    io.stderr.joined(),
    'filter-findings: dropped "a.js":2 — outside the scope\n'
    + 'filter-findings: 1 of 1 finding(s) fell outside the scope — check that the technique emits repo-relative paths matching the spec\n',
  );
});

test('Given an input that filters to a non-empty result, when main runs, then no drop notice is written', () => {
  const io = makeIo();
  const path = writeTmp('keep.json', JSON.stringify([{ file: 'a.js', line: 2, severity: 'HIGH', finding: 'x' }]));

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  assert.equal(io.stderr.joined(), '');
});

test('Given a mixed payload where some findings fall outside the scope, when main runs, then each drop is named on stderr', () => {
  const io = makeIo();
  const path = writeTmp('mixed.json', JSON.stringify([
    { file: 'a.js', line: 5, severity: 'LOW', finding: 'style' },
    { file: '/abs/a.js', line: 7, severity: 'CRITICAL', finding: 'hardcoded key' },
  ]));

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  // Exact lines, in order: a mutant that names the KEPT finding as dropped, or
  // that emits the aggregate first, must not survive.
  assert.deepEqual(io.stderr.joined().split('\n').filter(Boolean), [
    'filter-findings: dropped "/abs/a.js":7 — outside the scope (absolute path, no --repo-root supplied)',
    'filter-findings: 1 of 2 finding(s) fell outside the scope — check that the technique emits repo-relative paths matching the spec',
  ]);
});

test('Given an empty findings array, when main runs, then nothing is reported as dropped', () => {
  const io = makeIo();
  const path = writeTmp('empty.json', '[]');

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  assert.equal(io.stderr.joined(), '');
  assert.equal(io.stdout.joined(), '[]\n');
});

// ─── --scope flag position and --repo-root arithmetic ───────────────────────
// Kills three mutants at filter-findings-main.js:55 (the missing-`--repo-root`-
// value guard): the ConditionalExpression forcing the first operand `true`,
// the UnaryOperator turning `-1` into `+1`, and (transitively) the MethodExpression
// at :52 that would fold `--scope`'s own tokens back into `rest`. With `--scope`
// consuming both its own tokens and nothing else supplied, `rest` is empty and
// `--repo-root` was never given — none of these mutants may report it missing.
test('Given only --scope and its value (no positional path, no --repo-root), when main runs, then it does not misreport a missing --repo-root value', () => {
  const io = makeIo();

  const result = main(['--scope', 'a.js:1-9'], io);

  assert.equal(result, 2);
  // The only real failure past this point is the stdin guard this test harness
  // installs — never the args-parsing branch.
  assert.equal(io.stderr.joined(), 'filter-findings: readStdin should not be called in file-path mode\n');
});

// Kills the ArithmeticOperator at :55 (`rootIndex + 1` → `rootIndex - 1`), the
// ConditionalExpression at :59 (`rootIndex === -1 ? rest : …` forced true), and
// the MethodExpression/ArithmeticOperator pair at :61 (the positionals slice
// dropping or mis-bounding around `--repo-root`'s two tokens) — all four would
// make `--repo-root` as the first token after `--scope`'s value resolve the
// wrong positional file path (or none at all).
test('Given --repo-root as the first token after the scope value, when main runs, then the repo root resolves correctly and the trailing positional is read as the file path', () => {
  const io = makeIo();
  const path = writeTmp('reporoot-first.json', JSON.stringify([
    { file: '/some/value/a.js', line: 4, severity: 'HIGH', finding: 'x' },
  ]));

  const result = main(['--scope', 'a.js:1-9', '--repo-root', '/some/value', path], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(JSON.parse(io.stdout.joined()).length, 1, 'the absolute finding must resolve against the supplied repo root');
});

test('Given --repo-root as the final argument with no value, when main runs, then it reports the missing value', () => {
  const io = makeIo();

  const result = main(['--scope', 'a.js:1-9', '--repo-root'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /missing --repo-root value/u);
});

test('Given a repo root written with a trailing slash, when findings are filtered, then it matches the same as without', () => {
  const io = makeIo();
  const path = writeTmp('abs.json', JSON.stringify([
    { file: '/repo/a.js', line: 5, severity: 'HIGH', finding: 'x' },
  ]));

  const result = main([path, '--scope', 'a.js:1-9', '--repo-root', '/repo/'], io);

  assert.equal(result, 0);
  assert.equal(JSON.parse(io.stdout.joined()).length, 1);
});

test('Given an absolute-path finding dropped with no repo root supplied, when main runs, then the notice names that cause', () => {
  const io = makeIo();
  const path = writeTmp('absnoroot.json', JSON.stringify([
    { file: '/repo/a.js', line: 5, severity: 'HIGH', finding: 'x' },
  ]));

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /absolute path, no --repo-root supplied/u);
});

test('Given a path carrying a newline, when the drop is reported, then it cannot forge a second notice line', () => {
  const io = makeIo();
  const path = writeTmp('forge.json', JSON.stringify([
    { file: 'x.js\nfilter-findings: 0 of 0 finding(s) fell outside the scope — clean', line: 1, severity: 'HIGH', finding: 'x' },
  ]));

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  const lines = io.stderr.joined().split('\n').filter(Boolean);
  assert.equal(lines.length, 2, `expected exactly one drop line plus the aggregate, got: ${JSON.stringify(lines)}`);
  // The forged text may appear, but only escaped INSIDE the quoted path — never
  // as its own notice line, which is what would mislead a reader.
  assert.ok(
    !lines.some(l => l.startsWith('filter-findings: 0 of 0')),
    `a forged notice line escaped escaping: ${JSON.stringify(lines)}`,
  );
  assert.ok(lines[0].includes('\\n'), 'the newline must be escaped, not literal');
});

// Kills the EqualityOperator mutant at :132 (`dropped > MAX_NAMED_DROPS` →
// `>=`): at exactly the cap, every drop is already named individually, so no
// "… and N more" overflow line may appear.
test('Given exactly as many dropped findings as the naming cap, when main runs, then no overflow line is printed', () => {
  const io = makeIo();
  const exactly20 = Array.from({ length: 20 }, (_, i) => ({ file: 'zz.js', line: i + 1, severity: 'LOW', finding: 'x' }));
  const path = writeTmp('exactly20.json', JSON.stringify(exactly20));

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  assert.ok(!io.stderr.joined().includes('more'), `expected no overflow line at exactly the cap, got: ${io.stderr.joined()}`);
});

test('Given more dropped findings than the naming cap, when main runs, then the enumeration is bounded', () => {
  const io = makeIo();
  const many = Array.from({ length: 50 }, (_, i) => ({ file: 'zz.js', line: i + 1, severity: 'LOW', finding: 'x' }));
  const path = writeTmp('many.json', JSON.stringify(many));

  const result = main([path, '--scope', 'a.js:1-9'], io);

  assert.equal(result, 0);
  const lines = io.stderr.joined().split('\n').filter(Boolean);
  assert.equal(lines.length, 22, `20 named + overflow + aggregate, got ${lines.length}`);
  assert.ok(lines.some(l => l.includes('… and 30 more')), io.stderr.joined());
});

// ─── echoPath truncation (MAX_ECHO_CHARS = 120) ──────────────────────────────
// Kills the EqualityOperator mutant at :22 (`file.length > MAX_ECHO_CHARS` →
// `>=`): exactly at the cap, the path must be echoed whole, not truncated.
test('Given a dropped finding whose file path is exactly at the echo cap, when main runs, then the path is echoed whole (not truncated)', () => {
  const io = makeIo();
  const exactPath = `${'a'.repeat(117)}.js`; // exactly 120 chars — 121 would trip the truncation
  const path = writeTmp('atcap.json', JSON.stringify([
    { file: exactPath, line: 3, severity: 'HIGH', finding: 'x' },
  ]));

  const result = main([path, '--scope', 'b.js:1-9'], io);

  assert.equal(result, 0);
  assert.ok(io.stderr.joined().includes(JSON.stringify(exactPath)), `expected the whole path echoed, got: ${io.stderr.joined()}`);
});

// Kills the ConditionalExpression mutant at :22 (forcing the ternary's
// condition false) and both NoCoverage mutants on the truncated-branch content
// (the slice or the ellipsis suffix): over the cap, the echoed path must be
// truncated to exactly the first 120 chars, plus an ellipsis.
test('Given a dropped finding whose file path exceeds the echo cap, when main runs, then the echoed path is truncated to the cap plus an ellipsis', () => {
  const io = makeIo();
  const longPath = `${'a'.repeat(130)}.js`;
  const path = writeTmp('overcap.json', JSON.stringify([
    { file: longPath, line: 3, severity: 'HIGH', finding: 'x' },
  ]));

  const result = main([path, '--scope', 'b.js:1-9'], io);

  assert.equal(result, 0);
  const truncated = longPath.slice(0, 120);
  assert.ok(io.stderr.joined().includes(JSON.stringify(`${truncated}…`)), `expected the truncated ellipsis form, got: ${io.stderr.joined()}`);
  assert.ok(!io.stderr.joined().includes(longPath), 'the full untruncated path must not appear');
});

test('Given an absolute-path finding dropped WITH a repo root supplied, when main runs, then no missing-root hint is emitted', () => {
  const io = makeIo();
  const path = writeTmp('absroot.json', JSON.stringify([
    { file: '/repo/b.js', line: 5, severity: 'HIGH', finding: 'x' },
  ]));

  const result = main([path, '--scope', 'a.js:1-9', '--repo-root', '/repo'], io);

  assert.equal(result, 0);
  // The path is echoed as the technique emitted it, not as canonicalized.
  assert.match(io.stderr.joined(), /dropped "\/repo\/b\.js":5/u);
  assert.ok(!io.stderr.joined().includes('no --repo-root supplied'), io.stderr.joined());
});
