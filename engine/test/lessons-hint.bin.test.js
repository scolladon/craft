import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '..', 'bin', 'lessons-hint.js');
const FIXTURE = join(HERE, '..', '..', 'docs', 'contributing', 'lessons', '001-stryker-repeated-mutate-flag-keeps-last.md');
const LESSON_DIR = 'docs/lessons';
const COMMITTED_TITLE = 'Stryker keeps only the last repeated --mutate flag';
const DRAFT_TITLE = 'A drafted lesson';

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function git(cwd, ...args) {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function repoWithCommittedAndDraftedLesson() {
  const root = mkdtempSync(join(tmpdir(), 'lessonshint-bin-'));
  tmpDirs.push(root);
  git(root, 'init', '-q');
  mkdirSync(join(root, LESSON_DIR), { recursive: true });
  const committed = readFileSync(FIXTURE, 'utf8');
  writeFileSync(join(root, LESSON_DIR, '001-committed.md'), committed);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  writeFileSync(join(root, LESSON_DIR, '002-draft.md'), committed.replace('# 001', '# 002').replace(COMMITTED_TITLE, DRAFT_TITLE));
  return root;
}

function runBin(cwd, args, input = 'engine/src/intention.js\n') {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, input, encoding: 'utf8' });
}

test('Given a committed lesson and an uncommitted one, when the bin runs, then only the committed one is printed', () => {
  const root = repoWithCommittedAndDraftedLesson();
  const sut = runBin;

  const result = sut(root, ['--phase', 'validation', '--base', 'HEAD']);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.startsWith('Lessons (advisory'));
  assert.ok(result.stdout.includes(COMMITTED_TITLE));
  assert.ok(result.stdout.includes(`${LESSON_DIR}/001-committed.md`));
  assert.ok(!result.stdout.includes(DRAFT_TITLE));
});

test('Given a repo with no resolvable default branch, when the bin runs without --base, then it notes on stderr and exits 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'lessonshint-bin-'));
  tmpDirs.push(root);
  git(root, 'init', '-q');
  const sut = runBin;

  const result = sut(root, ['--phase', 'validation']);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^craft-lessons-hint: /);
});

test('Given a usage error, when the bin runs, then it exits 2', () => {
  const sut = runBin;

  const result = sut(tmpdir(), []);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: lessons-hint/);
});

test('Given the bin imported as a module, when loaded, then main does not run', () => {
  const sut = pathToFileURL(BIN).href;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(sut)})`], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
