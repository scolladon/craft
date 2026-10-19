import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/lesson-lint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const EM_DASH = '—';
const LESSONS = 'lessons';
const EXIT_INVALID = 2;

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'lessonlint-'));
  tmpDirs.push(root);
  mkdirSync(join(root, '.git'));
  writeFileSync(join(root, 'README.md'), '# readme\n');
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'file.md'), 'x\n');
  return root;
}

function bodyText({ number = '001', howToApply = 'Do the thing.', extra = '' } = {}) {
  return [
    `# ${number} ${EM_DASH} A title`,
    '',
    '## Context',
    `Why. ${extra}`,
    '',
    '## Lesson',
    'What.',
    '',
    '## How to apply',
    howToApply,
    '',
    '## Evidence',
    'Where.',
    '',
  ].join('\n');
}

const BASE_FRONTMATTER = {
  subjects: "['engine/src/**']",
  phases: '[validation]',
  kind: 'trap',
  trigger: 'running a scoped mutation',
  evidence: "['README.md']",
  source: '{ run: some-run, phase: design, date: 2026-10-19 }',
  status: 'active',
  'last-verified': '2026-10-19',
};

function lessonText({ frontmatter = {}, body = bodyText() } = {}) {
  const merged = { ...BASE_FRONTMATTER, ...frontmatter };
  const lines = Object.entries(merged)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`);
  return ['---', ...lines, '---', '', body].join('\n');
}

function writeLesson(root, name, content = lessonText()) {
  mkdirSync(join(root, LESSONS), { recursive: true });
  writeFileSync(join(root, LESSONS, name), content);
}

function lint(sut, root, argv = [LESSONS]) {
  const io = makeCaptureIo();
  const code = sut(argv, io, { cwd: () => root });
  return { code, out: io.stdout.joined(), err: io.stderr.joined() };
}

test('Given no argument, when lesson-lint runs, then it exits 2 with a usage line', () => {
  const root = fixtureRoot();
  const sut = main;

  const result = lint(sut, root, []);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('usage: lesson-lint <lessons-dir>'));
});

test('Given a missing directory, when lesson-lint runs, then it exits 0 and says there is no lessons directory', () => {
  const root = fixtureRoot();
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, 0);
  assert.equal(result.out, 'craft-lessons: no lessons directory at lessons\n');
});

test('Given an empty directory, when lesson-lint runs, then it exits 0 with OK and zero lessons', () => {
  const root = fixtureRoot();
  mkdirSync(join(root, LESSONS));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, 0);
  assert.ok(result.out.includes('OK'));
  assert.ok(result.out.includes('0 lesson(s)'));
});

test('Given one valid lesson whose evidence resolves, when lesson-lint runs, then it exits 0 with OK and one lesson', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md');
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, 0, result.err);
  assert.ok(result.out.includes('craft-lessons: OK'));
  assert.ok(result.out.includes('1 lesson(s)'));
  assert.ok(!result.out.includes('stale-evidence'));
});

test('Given a lesson with an invalid kind, when lesson-lint runs, then it exits 2 with an INVALID block naming the file', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', lessonText({ frontmatter: { kind: 'bogus' } }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('craft-lessons: INVALID corpus:'));
  assert.ok(result.err.includes('- lessons/001-first.md: kind must be one of'));
});

test('Given a How to apply of 7 non-empty lines, when lesson-lint runs, then it exits 2', () => {
  const root = fixtureRoot();
  const howToApply = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].join('\n');
  writeLesson(root, '001-first.md', lessonText({ body: bodyText({ howToApply }) }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('How to apply'));
});

test('Given an unfenced markdown file, when lesson-lint runs, then it exits 2 with missing frontmatter', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', bodyText());
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('missing frontmatter'));
});

test('Given a README in the lessons directory, when lesson-lint runs, then it exits 2 on the filename rule', () => {
  const root = fixtureRoot();
  writeLesson(root, 'README.md', '# Lessons\n');
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('filename must be NNN-<slug>.md'));
});

test('Given an H1 number that differs from the filename number, when lesson-lint runs, then it exits 2', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', lessonText({ body: bodyText({ number: '002' }) }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('H1 number 2 does not match filename number 1'));
});

for (const [label, extra] of [
  ['a /Users path', '/Users/alice/x'],
  ['a /home path', '/home/user/x'],
  ['a $HOME reference', '$HOME/x'],
  ['a braced HOME reference', '${HOME}/x'],
  ['a tilde path', '~/x'],
  ['a /root path', '/root/x'],
  ['a /private/var/folders path', '/private/var/folders/ab/x'],
  ['a /var/folders path', '/var/folders/ab/x'],
  ['a Windows user path', 'C:\\Users\\alice\\x'],
  ['a lowercase-drive Windows user path', 'd:\\Users\\alice\\x'],
]) {
  test(`Given a lesson body holding ${label}, when lesson-lint runs, then it exits 2`, () => {
    const root = fixtureRoot();
    writeLesson(root, '001-first.md', lessonText({ body: bodyText({ extra }) }));
    const sut = main;

    const result = lint(sut, root);

    assert.equal(result.code, EXIT_INVALID);
    assert.ok(result.err.includes('home-rooted path or $HOME reference'));
  });
}

test('Given two lessons sharing a number, when lesson-lint runs, then it exits 2 on the duplicate', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md');
  writeLesson(root, '001-second.md');
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('duplicate lesson number 1'));
});

test('Given supersedes naming no lesson, when lesson-lint runs, then it exits 2', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', lessonText({ frontmatter: { supersedes: '[7]' } }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('supersedes 7 names no lesson'));
});

test('Given supersedes naming an active lesson, when lesson-lint runs, then it exits 2', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md');
  writeLesson(root, '002-second.md', lessonText({ frontmatter: { supersedes: '[1]' }, body: bodyText({ number: '002' }) }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('supersedes 1 which is not superseded'));
});

test('Given a superseded lesson no lesson supersedes, when lesson-lint runs, then it exits 2', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', lessonText({ frontmatter: { status: 'superseded' } }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('superseded but no lesson supersedes it'));
});

test('Given a superseded lesson and its successor, when lesson-lint runs, then it exits 0', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', lessonText({ frontmatter: { status: 'superseded' } }));
  writeLesson(root, '002-second.md', lessonText({ frontmatter: { supersedes: '[1]' }, body: bodyText({ number: '002' }) }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, 0, result.err);
  assert.ok(result.out.includes('2 lesson(s)'));
});

test('Given an evidence path that does not resolve, when lesson-lint runs, then it reports stale-evidence and still exits 0', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', lessonText({ frontmatter: { evidence: "['gone/missing.js']" } }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, 0, result.err);
  assert.ok(result.out.includes('craft-lessons: stale-evidence lessons/001-first.md: gone/missing.js'));
});

test('Given an evidence entry with a line range, when lesson-lint runs, then it resolves by the path part', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', lessonText({ frontmatter: { evidence: "['docs/file.md:3-9']" } }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, 0, result.err);
  assert.ok(!result.out.includes('stale-evidence'));
});

test('Given a retired lesson with unresolved evidence, when lesson-lint runs, then no stale-evidence is reported', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', lessonText({ frontmatter: { status: 'retired', evidence: "['gone/missing.js']" } }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, 0, result.err);
  assert.ok(!result.out.includes('stale-evidence'));
});

test('Given a superseded lesson with unresolved evidence, when lesson-lint runs, then no stale-evidence is reported', () => {
  const root = fixtureRoot();
  writeLesson(root, '001-first.md', lessonText({ frontmatter: { status: 'superseded', evidence: "['gone/missing.js']" } }));
  writeLesson(root, '002-second.md', lessonText({ frontmatter: { supersedes: '[1]' }, body: bodyText({ number: '002' }) }));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, 0, result.err);
  assert.ok(!result.out.includes('stale-evidence'));
});

test('Given a symlink named like a lesson, when lesson-lint runs, then it exits 2 without echoing the target', () => {
  const root = fixtureRoot();
  mkdirSync(join(root, LESSONS));
  writeFileSync(join(root, 'secret.txt'), 'TOPSECRET\n');
  symlinkSync(join(root, 'secret.txt'), join(root, LESSONS, '002-b.md'));
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('- lessons/002-b.md: not a regular file'));
  assert.ok(!result.err.includes('TOPSECRET'));
});

test('Given a directory named like a lesson, when lesson-lint runs, then it exits 2 on a form error', () => {
  const root = fixtureRoot();
  mkdirSync(join(root, LESSONS, '002-b.md'), { recursive: true });
  const sut = main;

  const result = lint(sut, root);

  assert.equal(result.code, EXIT_INVALID);
  assert.ok(result.err.includes('- lessons/002-b.md: not a regular file'));
});
