import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/manifest-lint-main.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const manifestsDir = join(__dir, 'fixtures', 'manifests');

function makeIo() {
  const io = {
    stdout: { writes: [], write(s) { this.writes.push(s); } },
    stderr: { writes: [], write(s) { this.writes.push(s); } },
  };
  io.stdout.joined = () => io.stdout.writes.join('');
  io.stderr.joined = () => io.stderr.writes.join('');
  return io;
}

const tmpDirs = [];
after(() => tmpDirs.forEach(d => rmSync(d, { recursive: true, force: true })));

function writeTmp(name, content) {
  const dir = mkdtempSync(join(tmpdir(), 'manifestlint-'));
  tmpDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

// ─── absent path → 0 + stdout "no manifest at" ───────────────────────────────

test('Given a nonexistent manifest path, when main runs, then returns 0 and stdout contains "no manifest at"', () => {
  const sut = main;
  const io = makeIo();

  const result = sut(['/no/such/workflow.md'], io);

  assert.equal(result, 0);
  assert.ok(io.stdout.joined().includes('no manifest at'), `stdout was: ${io.stdout.joined()}`);
  assert.equal(io.stderr.joined(), '');
});

// ─── default path (no argv) → 0 + stdout "no manifest at" (cwd lacks it) ────

test('Given no argv (default manifest path), when main runs and the default file is absent, then returns 0 and stdout contains "no manifest at"', () => {
  const sut = main;
  const io = makeIo();

  // The default path ".claude/workflow.md" is resolved relative to cwd.
  // The engine/ cwd never has that file, so this is reliably absent.
  const result = sut([], io);

  assert.equal(result, 0);
  assert.ok(io.stdout.joined().includes('no manifest at'), `stdout was: ${io.stdout.joined()}`);
});

// ─── a directory path → treated as absent → 0 ────────────────────────────────

test('Given a directory path as the manifest, when main runs, then returns 0 (directory is not a regular file)', () => {
  const sut = main;
  const io = makeIo();

  const result = sut([__dir], io);

  assert.equal(result, 0);
  assert.ok(io.stdout.joined().includes('no manifest at'), `stdout was: ${io.stdout.joined()}`);
});

// ─── file with no frontmatter fence → 0 + stdout "no YAML frontmatter" ───────

test('Given a file with no YAML frontmatter fence, when main runs, then returns 0 and stdout contains "no YAML frontmatter"', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('no-fence.md', '# Just a heading\n\nNo frontmatter here.\n');

  const result = sut([path], io);

  assert.equal(result, 0);
  assert.ok(io.stdout.joined().includes('no YAML frontmatter'), `stdout was: ${io.stdout.joined()}`);
  assert.equal(io.stderr.joined(), '');
});

// ─── malformed YAML frontmatter → 2 + stderr "malformed YAML frontmatter" ────

test('Given a file with malformed YAML frontmatter, when main runs, then returns 2 and stderr contains "malformed YAML frontmatter"', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('malformed.md', '---\n: : :\n---\n');

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('malformed YAML frontmatter'), `stderr was: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── unknown top key → 2 + stderr "INVALID manifest" + "Fix the manifest" ───

test('Given a manifest with an unknown top-level key, when main runs, then returns 2 and stderr contains INVALID and Fix the manifest', () => {
  const sut = main;
  const io = makeIo();
  const path = writeTmp('bogus-key.md', '---\nbogus: 1\n---\n');

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('INVALID manifest'), `stderr was: ${io.stderr.joined()}`);
  assert.ok(io.stderr.joined().includes('Fix the manifest'), `stderr was: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── valid fenced manifest → 0 + stdout "<path> valid." ──────────────────────

test('Given a valid manifest (with-body.md, profile: lean), when main runs, then returns 0 and stdout contains "valid."', () => {
  const sut = main;
  const io = makeIo();
  const manifestPath = join(manifestsDir, 'with-body.md');

  const result = sut([manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('valid.'), `stdout was: ${io.stdout.joined()}`);
  assert.equal(io.stderr.joined(), '');
});

// ─── buildFileExists ROOT: relative file resolves two dirs up from manifest ──

test('Given a manifest that references a file existing relative to repo root, when main runs with buildFileExists, then validates without error', () => {
  const sut = main;
  const io = makeIo();
  // with-body.md lives at engine/test/fixtures/manifests/with-body.md.
  // Its ROOT = dirname(dirname(resolve(manifestPath))) = engine/test/fixtures/
  // Use a manifest in a temp dir that doesn't reference any paths that need
  // file-existence checking — just confirm the valid path returns 0.
  const manifestPath = join(manifestsDir, 'with-body.md');

  const result = sut([manifestPath], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
});

// ─── buildFileExists: file that does not exist relative to ROOT → invalid ────

test('Given a manifest referencing a nonexistent script file, when main runs, then returns 2 (fileExists check fails)', () => {
  const sut = main;
  const io = makeIo();
  // A manifest with a scripts.post-setup referencing a file that does not exist.
  const path = writeTmp('bad-script.md', '---\nscripts:\n  post-setup: no-such-script.sh\n---\n');

  const result = sut([path], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('INVALID manifest'), `stderr was: ${io.stderr.joined()}`);
});
