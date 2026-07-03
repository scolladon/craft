import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { main } from '../src/intention-lint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tmpRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'intentionlint-'));
  tmpDirs.push(dir);
  return dir;
}

function writeFixture(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

const GOOD_SOT = [
  '# Backlog',
  '',
  '> SoT — *intent:* `docs/PRD.md` · *decisions:* `docs/adr/` · *build scripts:* `docs/archive/PLAN-*.md` · *spikes:* `docs/archive/SPIKE.md`',
  '',
].join('\n');

const BAD_SOT = [
  '# Backlog',
  '',
  '> SoT — *intent:* `docs/MISSING.md`',
  '',
].join('\n');

const DECOY_ONLY = [
  '# Backlog',
  '',
  '> A general project note, unrelated to sourcing `docs/DECOY.md`',
  '',
].join('\n');

const PROSE_MENTIONS_SOT = [
  '# Backlog',
  '',
  'See the SoT policy note for background context.',
  '',
  '> SoT — *intent:* `docs/MISSING2.md`',
  '',
].join('\n');

const SOT_THEN_UNRELATED_PROSE = [
  '> SoT — *intent:* `docs/PRD.md`',
  '',
  'Unrelated follow-up text also references `docs/UNRELATED.md` for context.',
  '',
].join('\n');

function seedCorpusRoot() {
  const root = tmpRoot();
  writeFixture(root, 'docs/PRD.md', '# PRD\n');
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true });
  writeFixture(root, 'docs/archive/PLAN-foo.md', '# Plan\n');
  writeFixture(root, 'docs/archive/SPIKE.md', '# Spike\n');
  return root;
}

// ─── clean corpus (valid or absent subjects) → 0 ─────────────────────────────

test('Given a corpus of pages with valid or absent subjects, when main runs, then it returns 0', () => {
  const sut = main;
  const root = tmpRoot();
  const clean = writeFixture(root, 'docs/adapters/clean.md', "---\nsubjects: ['engine/src/foo/**']\n---\n# Clean\n");
  const noFm = writeFixture(root, 'docs/adapters/no-fm.md', '# No frontmatter\n\nprose\n');
  const io = makeCaptureIo();

  const result = sut([clean, noFm], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stderr.joined(), '');
  assert.equal(io.stdout.joined(), 'craft-intention: OK — 2 path(s) valid.\n');
});

// ─── mis-typed subjects block (parseSubjects throws) → 2 + diagnostic ────────

test('Given a page whose frontmatter opens but mis-types the subjects YAML, when main runs, then it returns 2 with a diagnostic', () => {
  const sut = main;
  const root = tmpRoot();
  const bad = writeFixture(root, 'docs/adapters/mistyped.md', '---\nsubjects: [unclosed\n---\n# Bad\n');
  const io = makeCaptureIo();

  const result = sut([bad], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('craft-intention:'), `stderr was: ${io.stderr.joined()}`);
  assert.ok(io.stderr.joined().includes('malformed YAML frontmatter'), `stderr was: ${io.stderr.joined()}`);
});

// ─── subjects: bare scalar → 2 ────────────────────────────────────────────────

test('Given a page whose subjects is a bare scalar, when main runs, then it returns 2', () => {
  const sut = main;
  const root = tmpRoot();
  const bad = writeFixture(root, 'docs/adapters/scalar.md', '---\nsubjects: foo\n---\n# Scalar\n');
  const io = makeCaptureIo();

  const result = sut([bad], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('subjects must be a list of non-empty strings'), `stderr was: ${io.stderr.joined()}`);
  assert.ok(
    io.stderr.joined().includes('Fix the corpus — craft refuses to run on malformed intention metadata'),
    `stderr was: ${io.stderr.joined()}`,
  );
});

// ─── subjects: empty list → 2 ─────────────────────────────────────────────────

test('Given a page whose subjects is an empty list, when main runs, then it returns 2', () => {
  const sut = main;
  const root = tmpRoot();
  const bad = writeFixture(root, 'docs/adapters/empty-list.md', '---\nsubjects: []\n---\n# Empty\n');
  const io = makeCaptureIo();

  const result = sut([bad], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('subjects must be a list of non-empty strings'), `stderr was: ${io.stderr.joined()}`);
});

// ─── subjects: list containing an empty string → 2 ───────────────────────────

test('Given a page whose subjects list contains an empty string, when main runs, then it returns 2', () => {
  const sut = main;
  const root = tmpRoot();
  const bad = writeFixture(root, 'docs/adapters/empty-string.md', "---\nsubjects: ['']\n---\n# EmptyString\n");
  const io = makeCaptureIo();

  const result = sut([bad], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('subjects must be a list of non-empty strings'), `stderr was: ${io.stderr.joined()}`);
});

// ─── page with no frontmatter → 0 (incremental adoption) ─────────────────────

test('Given a page with no frontmatter block, when main runs, then it returns 0', () => {
  const sut = main;
  const root = tmpRoot();
  const page = writeFixture(root, 'docs/adapters/no-fm.md', '# No frontmatter\n\nprose\n');
  const io = makeCaptureIo();

  const result = sut([page], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

// ─── BACKLOG.md with all SoT pointers resolvable (file, dir, glob) → 0 ───────

test('Given a BACKLOG.md whose SoT pointers (file, directory, glob) all resolve, when main runs, then it returns 0', () => {
  const sut = main;
  const root = seedCorpusRoot();
  const backlog = writeFixture(root, 'BACKLOG.md', GOOD_SOT);
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

// ─── BACKLOG.md with a dangling backtick path → 2 ─────────────────────────────

test('Given a BACKLOG.md whose SoT pointer names a nonexistent file, when main runs, then it returns 2 with a diagnostic naming the pointer', () => {
  const sut = main;
  const root = tmpRoot();
  const backlog = writeFixture(root, 'BACKLOG.md', BAD_SOT);
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('docs/MISSING.md'), `stderr was: ${io.stderr.joined()}`);
});

// ─── BACKLOG.md SoT pointer to a directory that does not exist → 2 ───────────

test('Given a BACKLOG.md SoT pointer to a directory that does not exist, when main runs, then it returns 2 with a diagnostic naming the pointer', () => {
  const sut = main;
  const root = tmpRoot();
  const backlog = writeFixture(root, 'BACKLOG.md', '> SoT — *decisions:* `docs/adr/`\n');
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('docs/adr/'), `stderr was: ${io.stderr.joined()}`);
});

// ─── BACKLOG.md SoT glob pointer matching zero files → 2 ─────────────────────

test('Given a BACKLOG.md SoT glob pointer matching zero files, when main runs, then it returns 2 with a diagnostic naming the pointer', () => {
  const sut = main;
  const root = tmpRoot();
  mkdirSync(join(root, 'docs', 'archive'), { recursive: true });
  const backlog = writeFixture(root, 'BACKLOG.md', '> SoT — *build scripts:* `docs/archive/PLAN-*.md`\n');
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('docs/archive/PLAN-*.md'), `stderr was: ${io.stderr.joined()}`);
});

// ─── mixed argv: corpus pages + BACKLOG.md together, all valid → 0 ───────────

test('Given argv mixing valid corpus pages and a valid BACKLOG.md, when main runs, then it returns 0', () => {
  const sut = main;
  const root = seedCorpusRoot();
  const clean = writeFixture(root, 'docs/adapters/clean.md', "---\nsubjects: ['engine/src/foo/**']\n---\n# Clean\n");
  const backlog = writeFixture(root, 'BACKLOG.md', GOOD_SOT);
  const io = makeCaptureIo();

  const result = sut([clean, backlog], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

// ─── SoT marker search requires the leading `>` blockquote, not just the substring ─

test('Given a BACKLOG.md whose only blockquote has no SoT marker, when main runs, then the dangling pointer inside it is never checked (returns 0)', () => {
  const sut = main;
  const root = tmpRoot();
  const backlog = writeFixture(root, 'BACKLOG.md', DECOY_ONLY);
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

test('Given a BACKLOG.md whose prose mentions "SoT" outside any blockquote, when main runs, then the marker search still requires the leading `>` (returns 2 naming the real SoT pointer)', () => {
  const sut = main;
  const root = tmpRoot();
  const backlog = writeFixture(root, 'BACKLOG.md', PROSE_MENTIONS_SOT);
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('docs/MISSING2.md'), `stderr was: ${io.stderr.joined()}`);
});

// ─── SoT block boundary: no trailing newline, no leaking into unrelated prose ─

test("Given a BACKLOG.md whose SoT quote is the file's last line with no trailing newline, when main runs, then it still returns 0", () => {
  const sut = main;
  const root = seedCorpusRoot();
  const backlog = writeFixture(root, 'BACKLOG.md', '> SoT — *intent:* `docs/PRD.md`');
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

test('Given a BACKLOG.md whose SoT quote is followed by unrelated prose containing a backtick path, when main runs, then only the quoted block is checked (returns 0)', () => {
  const sut = main;
  const root = seedCorpusRoot();
  const backlog = writeFixture(root, 'BACKLOG.md', SOT_THEN_UNRELATED_PROSE);
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

// ─── glob SoT pointer with no directory component ─

test("Given a BACKLOG.md SoT glob pointer with no directory component, when main runs, then it resolves against BACKLOG.md's own directory (returns 0)", () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'PLAN-foo.md', '# Plan\n');
  const backlog = writeFixture(root, 'BACKLOG.md', '> SoT — *build scripts:* `PLAN-*.md`\n');
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

// ─── subjects: every entry must be valid, not just one ─

test('Given a page whose subjects list mixes a valid entry with an empty string, when main runs, then it returns 2', () => {
  const sut = main;
  const root = tmpRoot();
  const bad = writeFixture(root, 'docs/adapters/mixed.md', "---\nsubjects: ['engine/src/foo/**', '']\n---\n# Mixed\n");
  const io = makeCaptureIo();

  const result = sut([bad], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('subjects must be a list of non-empty strings'), `stderr was: ${io.stderr.joined()}`);
});

test('Given a page whose subjects list contains a nested array (has a numeric length but is not a string), when main runs, then it returns 2', () => {
  const sut = main;
  const root = tmpRoot();
  const bad = writeFixture(root, 'docs/adapters/nested.md', "---\nsubjects: [['nested'], 'engine/src/foo/**']\n---\n# Nested\n");
  const io = makeCaptureIo();

  const result = sut([bad], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('subjects must be a list of non-empty strings'), `stderr was: ${io.stderr.joined()}`);
});

// ─── BACKLOG.md SoT pointer escaping the repo root (absolute path) → 2, never read out-of-tree ─

test('Given a BACKLOG.md whose SoT pointer is an absolute path escaping the repo root, when main runs, then it returns 2 with a diagnostic naming the pointer as unresolvable', () => {
  const sut = main;
  const root = tmpRoot();
  const backlog = writeFixture(root, 'BACKLOG.md', '> SoT — *intent:* `/etc/passwd`\n');
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('unresolvable SoT pointer: /etc/passwd'), `stderr was: ${io.stderr.joined()}`);
});

// ─── BACKLOG.md SoT glob pointer whose base segment resolves to a file, not a directory → 2 ─

test('Given a BACKLOG.md SoT glob pointer whose base segment resolves to a file rather than a directory, when main runs, then it returns 2 with a diagnostic naming the pointer', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'README.md', '# Readme\n');
  const backlog = writeFixture(root, 'BACKLOG.md', '> SoT — *build scripts:* `README.md/*.md`\n');
  const io = makeCaptureIo();

  const result = sut([backlog], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('README.md/*.md'), `stderr was: ${io.stderr.joined()}`);
});

// ─── main's readFileSync catch: a path that does not exist on disk → 2 ──────────────

test('Given a path that does not exist on disk, when main runs, then it returns 2 with a "cannot read" diagnostic naming the path', () => {
  const sut = main;
  const root = tmpRoot();
  const missing = join(root, 'does-not-exist.md');
  const io = makeCaptureIo();

  const result = sut([missing], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes(`cannot read ${missing}`), `stderr was: ${io.stderr.joined()}`);
});
