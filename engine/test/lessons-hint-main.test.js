import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/lessons-hint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const EM_DASH = '—';
const EXIT_USAGE = 2;
const BASE = 'origin/HEAD';
const DIR = 'docs/lessons';

function lessonText({ number = '001', phases = 'validation', verified = '2026-10-19', howToApply = '- Do it.\n- Then that.' } = {}) {
  return [
    '---',
    "subjects: ['engine/src/**']",
    `phases: [${phases}]`,
    'kind: trap',
    'trigger: running a scoped mutation',
    "evidence: ['README.md']",
    'source: { run: some-run, phase: design, date: 2026-10-19 }',
    'status: active',
    `last-verified: ${verified}`,
    '---',
    '',
    `# ${number} ${EM_DASH} Title ${number}`,
    '',
    '## Context',
    'Why.',
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

function fakeGit(files, { base = BASE, dir = DIR } = {}) {
  const bases = [].concat(base);
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') {
      if (bases.includes(args.at(-1))) return `${args.at(-1)}\n`;
      throw new Error('bad revision');
    }
    if (args[0] === 'ls-tree') return Object.keys(files).map((n) => `${dir}/${n}`).join('\n') + '\n';
    if (args[0] === 'show') return files[args[1].split('/').pop()];
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  git.calls = calls;
  return git;
}

function run(sut, argv, { files = { '001-a.md': lessonText() }, stdin = 'engine/src/x.js\n', git } = {}) {
  const io = makeCaptureIo();
  const deps = { git: git ?? fakeGit(files), readStdin: () => stdin };
  const code = sut(argv, io, deps);
  return { code, out: io.stdout.joined(), err: io.stderr.joined(), deps };
}

test('Given a matching lesson, when run, then it prints the header, index line and indented How to apply', () => {
  const sut = main;

  const result = run(sut, ['--phase', 'validation']);

  assert.equal(result.code, 0);
  assert.equal(result.out, [
    'Lessons (advisory — open the path for context and evidence):',
    `- Title 001 — when running a scoped mutation → ${DIR}/001-a.md`,
    '  - Do it.',
    '  - Then that.',
    '',
  ].join('\n'));
});

test('Given no lesson matching the scope, when run, then it prints nothing and exits 0', () => {
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { stdin: 'unrelated/file.txt\n' });

  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  assert.equal(result.err, '');
});

test('Given a lesson for another phase, when run, then it is filtered out', () => {
  const sut = main;

  const result = run(sut, ['--phase', 'design']);

  assert.equal(result.out, '');
});

test('Given more lessons than --max, when run, then only max are printed', () => {
  const files = { '001-a.md': lessonText({ number: '001' }), '002-b.md': lessonText({ number: '002' }), '003-c.md': lessonText({ number: '003' }) };
  const sut = main;

  const result = run(sut, ['--phase', 'validation', '--max', '1'], { files });

  assert.equal(result.out.split('\n').filter((l) => l.startsWith('- ')).length, 1);
});

test('Given no --max, when run with four lessons, then three are printed', () => {
  const files = Object.fromEntries([1, 2, 3, 4].map((n) => [`00${n}-x.md`, lessonText({ number: `00${n}` })]));
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { files });

  assert.equal(result.out.split('\n').filter((l) => l.startsWith('- ')).length, 3);
});

test('Given blank lines in the stdin scope, when run, then they are ignored and paths trimmed', () => {
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { stdin: '\n  \nengine/src/x.js\n\n' });

  assert.ok(result.out.includes('Title 001'));
});

test('Given a blank line in How to apply, when run, then blank lines are kept out', () => {
  const files = { '001-a.md': lessonText({ howToApply: 'One.\n\nTwo.' }) };
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { files });

  assert.ok(result.out.endsWith('  One.\n  Two.\n'));
});

test('Given a non-md entry in the dir, when run, then it is not read', () => {
  const files = { '001-a.md': lessonText(), 'notes.txt': 'x' };
  const git = fakeGit(files);
  const sut = main;

  run(sut, ['--phase', 'validation'], { git });

  assert.equal(git.calls.filter((a) => a[0] === 'show').length, 1);
});

test('Given an explicit --base and --dir, when run, then git is asked about them', () => {
  const git = fakeGit({ '001-a.md': lessonText() }, { base: 'v1', dir: 'custom' });
  const sut = main;

  const result = run(sut, ['--phase', 'validation', '--base', 'v1', '--dir', 'custom'], { git });

  assert.ok(result.out.includes('→ custom/001-a.md'));
  assert.deepEqual(git.calls.find((a) => a[0] === 'ls-tree'), ['ls-tree', '--name-only', 'v1', '--', 'custom/']);
  assert.deepEqual(git.calls.find((a) => a[0] === 'show'), ['show', 'v1:custom/001-a.md']);
});

test('Given no --base and only main resolvable, when run, then main is the base', () => {
  const git = fakeGit({ '001-a.md': lessonText() }, { base: 'main' });
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { git });

  assert.ok(result.out.includes('Title 001'));
  assert.deepEqual(git.calls.find((a) => a[0] === 'ls-tree').slice(0, 3), ['ls-tree', '--name-only', 'main']);
});

test('Given no --base and only master resolvable, when run, then master is the base', () => {
  const git = fakeGit({ '001-a.md': lessonText() }, { base: 'master' });
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { git });

  assert.ok(result.out.includes('Title 001'));
});

test('Given no resolvable base, when run, then a stderr note and exit 0', () => {
  const git = fakeGit({}, { base: 'none' });
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { git });

  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  assert.match(result.err, /^craft-lessons-hint: .+\n$/);
});

test('Given an explicit bad --base, when run, then a stderr note and exit 0', () => {
  const sut = main;

  const result = run(sut, ['--phase', 'validation', '--base', 'nope']);

  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  assert.match(result.err, /^craft-lessons-hint: .+\n$/);
});

test('Given a dir missing at base, when run, then a stderr note and exit 0', () => {
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { files: {} });

  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  assert.match(result.err, /^craft-lessons-hint: .*docs\/lessons/);
});

test('Given git failing on show, when run, then a stderr note and exit 0', () => {
  const git = (args) => {
    if (args[0] === 'show') throw new Error('boom');
    return args[0] === 'ls-tree' ? `${DIR}/001-a.md\n` : 'ok\n';
  };
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { git });

  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  assert.match(result.err, /^craft-lessons-hint: boom\n$/);
});

for (const [title, argv] of [
  ['an unknown flag', ['--phase', 'validation', '--nope', 'x']],
  ['a missing --phase', ['--max', '2']],
  ['a non-numeric --max', ['--phase', 'validation', '--max', 'many']],
  ['a zero --max', ['--phase', 'validation', '--max', '0']],
  ['a flag without value', ['--phase']],
  ['a stray positional', ['--phase', 'validation', 'extra']],
]) {
  test(`Given ${title}, when run, then usage on stderr and exit 2`, () => {
    const sut = main;

    const result = run(sut, argv);

    assert.equal(result.code, EXIT_USAGE);
    assert.equal(result.out, '');
    assert.match(result.err, /^usage: lessons-hint --phase/);
  });
}

test('Given origin/HEAD and main both resolvable, when run without --base, then origin/HEAD is the base', () => {
  const git = fakeGit({ '001-a.md': lessonText() }, { base: ['origin/HEAD', 'main'] });
  const sut = main;

  run(sut, ['--phase', 'validation'], { git });

  const result = git.calls.find((a) => a[0] === 'ls-tree');
  assert.deepEqual(result.slice(0, 3), ['ls-tree', '--name-only', 'origin/HEAD']);
});

test('Given main and master both resolvable, when run without --base, then main is the base', () => {
  const git = fakeGit({ '001-a.md': lessonText() }, { base: ['main', 'master'] });
  const sut = main;

  run(sut, ['--phase', 'validation'], { git });

  const result = git.calls.find((a) => a[0] === 'ls-tree');
  assert.deepEqual(result.slice(0, 3), ['ls-tree', '--name-only', 'main']);
});

test('Given a --dir with a trailing slash, when run, then neither the pathspec nor the printed path has a double slash', () => {
  const git = fakeGit({ '001-a.md': lessonText() }, { base: 'v1', dir: 'custom' });
  const sut = main;

  const result = run(sut, ['--phase', 'validation', '--base', 'v1', '--dir', 'custom/'], { git });

  assert.deepEqual(git.calls.find((a) => a[0] === 'ls-tree'), ['ls-tree', '--name-only', 'v1', '--', 'custom/']);
  assert.ok(result.out.includes('→ custom/001-a.md'));
  assert.ok(!result.out.includes('//'));
});
