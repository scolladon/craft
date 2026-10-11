import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  EXIT_OK,
  EXIT_FOUND,
  parseArgs,
  collectWaived,
  scanFile,
  main,
  escapeRegExp,
  MAX_FILE_BYTES,
} from '../src/hygiene-lint-core.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tmpRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'hygienecore-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFixture(root, name, content) {
  const full = join(root, name);
  writeFileSync(full, content);
  return full;
}

const WAIVER = /X-WAIVE\(([^)]+)\)/g;

// a trivial per-module scan: one finding per line containing 'bad'
function scan(content) {
  const findings = [];
  content.split('\n').forEach((line, idx) => {
    if (line.includes('bad')) findings.push(`bad@L${idx + 1}`);
  });
  return findings;
}

function ctx(root, self = join(root, 'self.js')) {
  return { self, waiverPattern: WAIVER, foundToken: 'X-FOUND', scan };
}

// ─── parseArgs ──────────────────────────────────────────────────────────────

test('Given gate, waiver-source and file args, when parseArgs runs, then it partitions them', () => {
  const sut = parseArgs;

  const result = sut(['--gate', 'blocking', '--waiver-source', 'w.md', 'a.js', 'b.js']);

  assert.deepEqual(result, { gate: 'blocking', waiverSources: ['w.md'], files: ['a.js', 'b.js'] });
});

test('Given no --gate, when parseArgs runs, then gate defaults to a non-blocking value', () => {
  const sut = parseArgs;

  const result = sut(['a.js']);

  assert.notEqual(result.gate, 'blocking');
  assert.deepEqual(result.files, ['a.js']);
});

// ─── collectWaived ──────────────────────────────────────────────────────────

test('Given a waiver source with a matching token, when collectWaived runs with a regex, then the resolved captured path is waived', () => {
  const sut = collectWaived;
  const root = tmpRoot();
  const source = writeFixture(root, 'w.md', 'X-WAIVE(foo.js): tracked elsewhere\n');
  const io = makeCaptureIo();

  const { waived, readError } = sut([source], io, WAIVER);

  assert.equal(readError, false);
  assert.ok(waived.has(resolve(process.cwd(), 'foo.js')), `waived was: ${[...waived]}`);
});

test('Given an unreadable waiver source, when collectWaived runs, then it reports on stderr and flags a read error', () => {
  const sut = collectWaived;
  const root = tmpRoot();
  const io = makeCaptureIo();

  const { waived, readError } = sut([join(root, 'missing.md')], io, WAIVER);

  assert.equal(waived.size, 0);
  assert.equal(readError, true);
  assert.ok(io.stderr.joined().includes('cannot read waiver source'), `stderr: ${io.stderr.joined()}`);
});

// ─── collectWaived: a waiver is an anchored line outside a fenced block ────

const WAIVED_PATH = 'p.js';
const ANCHORED_WAIVER = 'X-WAIVE(p.js): r';
const BACKTICK_FENCE = '```';

function waivedFrom(sut, content) {
  const root = tmpRoot();
  const source = writeFixture(root, 'w.md', content);
  const { waived } = sut([source], makeCaptureIo(), WAIVER, MAX_FILE_BYTES, root);
  return { waived: [...waived], root };
}

test('Given a waiver token quoted mid-sentence, when collectWaived runs, then nothing is waived', () => {
  const sut = collectWaived;
  const root = tmpRoot();
  const source = writeFixture(root, 'w.md', `We note ${ANCHORED_WAIVER} in passing.\n`);
  const io = makeCaptureIo();

  const { waived, readError } = sut([source], io, WAIVER, MAX_FILE_BYTES, root);

  assert.equal(readError, false);
  assert.deepEqual([...waived], []);
});

test('Given a waiver token that does not start its line, when collectWaived runs, then each one is inert', () => {
  const sut = collectWaived;
  const rows = [
    ['inline code span', `\`${ANCHORED_WAIVER}\`\n`],
    ['bullet', `- ${ANCHORED_WAIVER}\n`],
    ['indented', `  ${ANCHORED_WAIVER}\n`],
    ['table cell', `| ${ANCHORED_WAIVER} |\n`],
    ['blockquote', `> ${ANCHORED_WAIVER}\n`],
  ];

  for (const [row, content] of rows) {
    const { waived } = waivedFrom(sut, content);

    assert.deepEqual(waived, [], `${row}: waived ${waived}`);
  }
});

test('Given a column-0 waiver token without a non-empty reason, when collectWaived runs, then each one is inert', () => {
  const sut = collectWaived;
  const rows = [
    ['no colon', 'X-WAIVE(p.js)\n'],
    ['empty reason', 'X-WAIVE(p.js):\n'],
    ['empty reason, CRLF', 'X-WAIVE(p.js):\r\n'],
  ];

  for (const [row, content] of rows) {
    const { waived } = waivedFrom(sut, content);

    assert.deepEqual(waived, [], `${row}: waived ${waived}`);
  }
});

test('Given two waiver tokens on one line, when collectWaived runs, then only the column-0 one is waived', () => {
  const sut = collectWaived;

  const { waived, root } = waivedFrom(sut, 'X-WAIVE(p.js): r X-WAIVE(q.js): s\n');

  assert.deepEqual(waived, [resolve(root, WAIVED_PATH)]);
});

test('Given an anchored waiver line, when collectWaived runs, then exactly its trimmed path is waived', () => {
  const sut = collectWaived;
  const rows = [
    ['bare line', `${ANCHORED_WAIVER}\n`],
    ['padded path', 'X-WAIVE(  p.js  ): r\n'],
    ['CRLF line', `${ANCHORED_WAIVER}\r\n`],
  ];

  for (const [row, content] of rows) {
    const { waived, root } = waivedFrom(sut, content);

    assert.deepEqual(waived, [resolve(root, WAIVED_PATH)], row);
  }
});

test('Given an anchored waiver line inside a fenced block, when collectWaived runs, then it is inert', () => {
  const sut = collectWaived;
  const rows = [
    ['backtick fence', `${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
    ['tilde fence', `~~~\n${ANCHORED_WAIVER}\n~~~\n`],
    ['info string', `\`\`\`js\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
    ['unclosed fence', `${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n`],
    ['shorter run does not close', `\`\`\`\`\n${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n\`\`\`\`\n`],
    ['other character does not close', `${BACKTICK_FENCE}\n~~~\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
    ['closer with trailing text does not close', `${BACKTICK_FENCE}\n\`\`\` x\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
    ['run after text does not close', `${BACKTICK_FENCE}\nx \`\`\`\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
    ['list-indented fence', `- item\n\n  ${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n  ${BACKTICK_FENCE}\n`],
    ['four-backtick fence', `\`\`\`\`\n${ANCHORED_WAIVER}\n\`\`\`\`\n`],
    ['shorter tilde run does not close', `~~~~\n~~~\n${ANCHORED_WAIVER}\n~~~~\n`],
    ['CRLF fence', `${BACKTICK_FENCE}\r\n${ANCHORED_WAIVER}\r\n${BACKTICK_FENCE}\r\n`],
    ['CRLF tilde fence', `~~~\r\n${ANCHORED_WAIVER}\r\n~~~\r\n`],
    ['CRLF tilde fence with an info string', `~~~md\r\n${ANCHORED_WAIVER}\r\n~~~\r\n`],
    ['closer indented four spaces does not close', `${BACKTICK_FENCE}\n    ${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n${BACKTICK_FENCE}\n`],
  ];

  for (const [row, content] of rows) {
    const { waived } = waivedFrom(sut, content);

    assert.deepEqual(waived, [], `${row}: waived ${waived}`);
  }
});

test('Given a fence that closes before an anchored waiver line, when collectWaived runs, then the line waives', () => {
  const sut = collectWaived;
  const rows = [
    ['backtick fence closed', `${BACKTICK_FENCE}\nx\n${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n`],
    ['tilde fence with a backtick info string', `~~~ a\`b\nx\n~~~\n${ANCHORED_WAIVER}\n`],
    ['inline triple backticks are not an opener', `\`\`\`a\`\`\` x\n${ANCHORED_WAIVER}\n`],
    ['four-backtick fence closed', `\`\`\`\`\nx\n\`\`\`\`\n${ANCHORED_WAIVER}\n`],
    ['indented fence closed by an indented closer', `  ${BACKTICK_FENCE}\nx\n  ${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n`],
    ['CRLF fence closed', `${BACKTICK_FENCE}\r\nx\r\n${BACKTICK_FENCE}\r\n${ANCHORED_WAIVER}\r\n`],
    ['longer closer closes', `${BACKTICK_FENCE}\nx\n\`\`\`\`\n${ANCHORED_WAIVER}\n`],
    ['closer indented three spaces closes', `${BACKTICK_FENCE}\nx\n   ${BACKTICK_FENCE}\n${ANCHORED_WAIVER}\n`],
  ];

  for (const [row, content] of rows) {
    const { waived, root } = waivedFrom(sut, content);

    assert.deepEqual(waived, [resolve(root, WAIVED_PATH)], row);
  }
});

// ─── scanFile ───────────────────────────────────────────────────────────────

test('Given the gate own source as the scanned file, when scanFile runs, then it is skipped (self-exclusion)', () => {
  const sut = scanFile;
  const root = tmpRoot();
  const self = join(root, 'self.js');
  writeFixture(root, 'self.js', 'a bad line that would match\n');
  const io = makeCaptureIo();

  const result = sut(self, new Set(), io, ctx(root, self));

  assert.deepEqual(result, { found: false, readError: false });
  assert.equal(io.stdout.joined(), '');
});

test('Given a file with a finding, when scanFile runs, then it prints the found token and reports found', () => {
  const sut = scanFile;
  const root = tmpRoot();
  const file = writeFixture(root, 'seeded.txt', 'a bad line\nclean line\n');
  const io = makeCaptureIo();

  const result = sut(file, new Set(), io, ctx(root));

  assert.deepEqual(result, { found: true, readError: false });
  assert.ok(io.stdout.joined().includes(`X-FOUND(${file}): bad@L1`), `stdout: ${io.stdout.joined()}`);
});

test('Given a waived file, when scanFile runs, then it is skipped with no findings', () => {
  const sut = scanFile;
  const root = tmpRoot();
  const file = writeFixture(root, 'waived.txt', 'a bad line\n');
  const io = makeCaptureIo();

  const result = sut(file, new Set([file]), io, ctx(root));

  assert.deepEqual(result, { found: false, readError: false });
  assert.equal(io.stdout.joined(), '');
});

test('Given a missing file, when scanFile runs, then it reports a read error', () => {
  const sut = scanFile;
  const root = tmpRoot();
  const io = makeCaptureIo();
  const missing = join(root, 'nope.txt');

  const result = sut(missing, new Set(), io, ctx(root));

  assert.deepEqual(result, { found: false, readError: true });
  assert.ok(io.stderr.joined().includes(`cannot read ${missing}`), `stderr: ${io.stderr.joined()}`);
});

// ─── main ───────────────────────────────────────────────────────────────────

test('Given a finding under --gate blocking, when main runs, then it exits EXIT_FOUND', () => {
  const sut = main;
  const root = tmpRoot();
  const file = writeFixture(root, 'seeded.txt', 'a bad line\n');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', file], io, ctx(root));

  assert.equal(result, EXIT_FOUND);
});

test('Given a finding under advisory, when main runs, then it prints but exits EXIT_OK', () => {
  const sut = main;
  const root = tmpRoot();
  const file = writeFixture(root, 'seeded.txt', 'a bad line\n');
  const io = makeCaptureIo();

  const result = sut([file], io, ctx(root));

  assert.equal(result, EXIT_OK);
  assert.ok(io.stdout.joined().includes('X-FOUND'), `stdout: ${io.stdout.joined()}`);
});

test('Given a clean file under blocking, when main runs, then it exits EXIT_OK', () => {
  const sut = main;
  const root = tmpRoot();
  const file = writeFixture(root, 'clean.txt', 'all good here\n');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', file], io, ctx(root));

  assert.equal(result, EXIT_OK);
  assert.equal(io.stdout.joined(), '');
});

// ─── Part 2 hardening: parseArgs `--` end-of-options + dangling flags ────────

test('Given a lone -- before the file list, when parseArgs runs, then every following option-looking token is a file', () => {
  const sut = parseArgs;

  const result = sut(['--gate', 'blocking', '--', '--gate', '--waiver-source', 'x', '--', 'y.js']);

  assert.equal(result.gate, 'blocking');
  // after the first --, nothing is an option: not --gate, not --waiver-source, not a second --
  assert.deepEqual(result.files, ['--gate', '--waiver-source', 'x', '--', 'y.js']);
  assert.deepEqual(result.waiverSources, []);
});

test('Given a trailing --gate with no value, when parseArgs runs, then it is ignored and gate stays default', () => {
  const sut = parseArgs;

  const result = sut(['a.js', '--gate']);

  assert.notEqual(result.gate, 'blocking');
  assert.equal(result.gate, 'advisory');
  assert.deepEqual(result.files, ['a.js']);
});

test('Given a trailing --waiver-source with no value, when parseArgs runs, then it is ignored (no undefined source)', () => {
  const sut = parseArgs;

  const result = sut(['a.js', '--waiver-source']);

  assert.deepEqual(result.waiverSources, []);
  assert.deepEqual(result.files, ['a.js']);
});

test('Given -- passed by ci.sh before real files, when main runs blocking with a finding, then it still gates', () => {
  const sut = main;
  const root = tmpRoot();
  const file = writeFixture(root, 'seeded.txt', 'a bad line\n');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', '--', file], io, ctx(root));

  assert.equal(result, EXIT_FOUND);
});

// ─── Part 2 hardening: waiver-path normalization ────────────────────────────

test('Given a waiver capture with a trailing slash and a scanned absolute path, when main runs blocking, then the finding is still cleared', () => {
  const sut = main;
  const root = tmpRoot();
  const file = writeFixture(root, 'seeded.txt', 'a bad line\n');
  const source = writeFixture(root, 'w.md', `X-WAIVE(${file}/): tracked\n`);
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', '--waiver-source', source, file], io, ctx(root));

  assert.equal(result, EXIT_OK, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

test('Given a waiver capture written as ./relative and the file scanned by the same relative path, when main runs blocking, then it clears', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'seeded.txt', 'a bad line\n');
  const source = writeFixture(root, 'w.md', 'X-WAIVE(./seeded.txt): tracked\n');
  const io = makeCaptureIo();
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const result = sut(['--gate', 'blocking', '--waiver-source', source, 'seeded.txt'], io, ctx(root, join(root, 'self.js')));
    assert.equal(result, EXIT_OK, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
    assert.equal(io.stdout.joined(), '');
  } finally {
    process.chdir(cwd);
  }
});

// ─── Part 2 hardening: waiver-source read errors gate under blocking ─────────

test('Given an unreadable --waiver-source under blocking, when main runs, then it exits EXIT_FOUND', () => {
  const sut = main;
  const root = tmpRoot();
  const file = writeFixture(root, 'clean.txt', 'all good here\n');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', '--waiver-source', join(root, 'missing.md'), file], io, ctx(root));

  assert.equal(result, EXIT_FOUND);
  assert.ok(io.stderr.joined().includes('cannot read waiver source'), `stderr: ${io.stderr.joined()}`);
});

test('Given an unreadable --waiver-source under advisory, when main runs, then it still exits EXIT_OK', () => {
  const sut = main;
  const root = tmpRoot();
  const file = writeFixture(root, 'clean.txt', 'all good here\n');
  const io = makeCaptureIo();

  const result = sut(['--waiver-source', join(root, 'missing.md'), file], io, ctx(root));

  assert.equal(result, EXIT_OK);
});

// ─── Part 2 hardening: large-file skip ──────────────────────────────────────

test('Given a file larger than the cap, when scanFile runs, then it emits a loud skip note and is neutral', () => {
  const sut = scanFile;
  const root = tmpRoot();
  const file = writeFixture(root, 'big.txt', 'a bad line that would otherwise match\n');
  const io = makeCaptureIo();

  const result = sut(file, new Set(), io, { ...ctx(root), maxBytes: 4 });

  assert.deepEqual(result, { found: false, readError: false });
  assert.equal(io.stdout.joined(), '');
  assert.ok(io.stderr.joined().includes(`skipping ${file}`), `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stderr.joined().includes('exceeds'), `stderr: ${io.stderr.joined()}`);
});

test('Given a file at or under the cap, when scanFile runs, then it scans normally', () => {
  const sut = scanFile;
  const root = tmpRoot();
  const file = writeFixture(root, 'small.txt', 'a bad line\n');
  const io = makeCaptureIo();

  const result = sut(file, new Set(), io, { ...ctx(root), maxBytes: 10_000 });

  assert.equal(result.found, true);
  assert.ok(io.stdout.joined().includes('X-FOUND'), `stdout: ${io.stdout.joined()}`);
});

test('Given a file exactly at the cap, when scanFile runs, then it is scanned (boundary is inclusive of the cap)', () => {
  const sut = scanFile;
  const root = tmpRoot();
  const file = writeFixture(root, 'exact.txt', 'abad'); // exactly 4 bytes, contains "bad"
  const io = makeCaptureIo();

  const result = sut(file, new Set(), io, { ...ctx(root), maxBytes: 4 });

  assert.equal(result.found, true, 'a file whose size equals the cap must be scanned, not skipped');
  assert.ok(io.stdout.joined().includes('X-FOUND'), `stdout: ${io.stdout.joined()}`);
});

test('Given a path that stats but cannot be read (a directory), when scanFile runs, then it reports a read error', () => {
  const sut = scanFile;
  const root = tmpRoot(); // a directory: statSync succeeds, readFileSync throws EISDIR
  const io = makeCaptureIo();

  const result = sut(root, new Set(), io, ctx(root, join(root, 'self.js')));

  assert.deepEqual(result, { found: false, readError: true });
  assert.ok(io.stderr.joined().includes(`cannot read ${root}`), `stderr: ${io.stderr.joined()}`);
});

test('Given an over-cap file under --gate blocking, when main runs, then the skip is neutral and it exits EXIT_OK', () => {
  const sut = main;
  const root = tmpRoot();
  const file = writeFixture(root, 'big.txt', 'a bad line that would otherwise gate\n');
  const io = makeCaptureIo();

  const result = sut(['--gate', 'blocking', file], io, { ...ctx(root), maxBytes: 4 });

  assert.equal(result, EXIT_OK, `a too-large file must not gate; stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
  assert.ok(io.stderr.joined().includes(`skipping ${file}`), `stderr: ${io.stderr.joined()}`);
});

// ─── Part 2 hardening: escapeRegExp ─────────────────────────────────────────

test('Given a literal with a . metacharacter, when escapeRegExp runs, then the pattern matches only the literal', () => {
  const sut = escapeRegExp;

  const pattern = new RegExp(`\\b${sut('a.b')}\\b`, 'i');

  assert.ok(pattern.test('a.b'), 'should match the literal a.b');
  assert.ok(!pattern.test('axb'), 'must not match axb (the . would over-match unescaped)');
});

test('Given each regex metacharacter, when escapeRegExp runs, then new RegExp is valid and matches the literal only', () => {
  const sut = escapeRegExp;
  // one representative literal per escaped metacharacter in the class [.*+?^${}()|[\]\\]
  const cases = [
    ['a*b', 'axxb'],
    ['a+b', 'aab'],
    ['a?b', 'ab'],
    ['a^b', 'axb'],
    ['a$b', 'axb'],
    ['a(b', 'axb'],
    ['a)b', 'axb'],
    ['a|b', 'a'],
    ['a{2}b', 'aab'],
    ['a[b', 'axb'],
    ['a\\b', 'axb'],
  ];
  for (const [literal, shouldNotMatch] of cases) {
    let pattern;
    assert.doesNotThrow(() => {
      pattern = new RegExp(`(?:^|\\s)${sut(literal)}(?:\\s|$)`);
    }, `new RegExp must not throw for ${literal}`);
    assert.ok(pattern.test(` ${literal} `), `escaped ${literal} should match itself`);
    assert.ok(!pattern.test(` ${shouldNotMatch} `), `escaped ${literal} must not over-match ${shouldNotMatch}`);
  }
});

// ─── Part 2 hardening: collectWaived size cap ───────────────────────────────

test('Given a waiver source larger than the cap, when collectWaived runs, then it is skipped with a note and yields no waivers', () => {
  const sut = collectWaived;
  const root = tmpRoot();
  const source = writeFixture(root, 'big-waiver.md', 'X-WAIVE(foo.js): tracked, and padded to exceed the cap\n');
  const io = makeCaptureIo();

  const { waived, readError } = sut([source], io, WAIVER, 4);

  assert.equal(waived.size, 0);
  assert.equal(readError, false, 'a size-skip is neutral, not a read error');
  assert.ok(io.stderr.joined().includes(`skipping waiver source ${source}`), `stderr: ${io.stderr.joined()}`);
});
