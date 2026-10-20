import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { main } from '../src/lessons-hint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const EM_DASH = '—';
const EXIT_USAGE = 2;
const BASE = 'origin/HEAD';
const DIR = 'docs/lessons';

function lessonText({ number = '001', subjects = "['engine/src/**']", phases = 'validation', verified = '2026-10-19', howToApply = '- Do it.\n- Then that.' } = {}) {
  return [
    '---',
    `subjects: ${subjects}`,
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

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const STUB_GIT = [
  '#!/bin/sh',
  '[ -c /dev/stdin ] || exit 9',
  'case "$1" in',
  '  rev-parse) exit 0 ;;',
  `  ls-tree) echo ${DIR}/001-a.md ;;`,
  '  show) cat "$(dirname "$0")/lesson.md" ;;',
  'esac',
  '',
].join('\n');

function withStubGitOnPath(fn) {
  const bin = mkdtempSync(join(tmpdir(), 'lessonshint-stub-'));
  tmpDirs.push(bin);
  writeFileSync(join(bin, 'git'), STUB_GIT);
  chmodSync(join(bin, 'git'), 0o755);
  writeFileSync(join(bin, 'lesson.md'), lessonText());
  const previous = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${previous}`;
  try {
    return fn();
  } finally {
    process.env.PATH = previous;
  }
}

// Reading fd 0 is the only way to reach the default stdin reader in-process: free fd 0, and the
// lowest-numbered open lands the fixture on it. Afterwards fd 0 is refilled so nothing else sees it closed.
function withStdin(text, fn) {
  const file = join(mkdtempSync(join(tmpdir(), 'lessonshint-stdin-')), 'stdin.txt');
  tmpDirs.push(dirname(file));
  writeFileSync(file, text);
  closeSync(0);
  const fd = openSync(file, 'r');
  try {
    return fn();
  } finally {
    closeSync(fd);
    openSync('/dev/null', 'r');
  }
}

test('Given the default dependencies, when run, then git is shelled out with stdin ignored and the scope comes from stdin', () => {
  const io = makeCaptureIo();
  const sut = main;

  const code = withStubGitOnPath(() => withStdin('engine/src/x.js\n', () => sut(['--phase', 'validation'], io)));

  assert.equal(code, 0);
  assert.equal(io.stderr.joined(), '');
  assert.ok(io.stdout.joined().includes(`- Title 001 \u2014 when running a scoped mutation \u2192 ${DIR}/001-a.md`));
});

for (const max of ['1x', 'x1']) {
  test(`Given --max ${max}, when run, then usage on stderr and exit 2`, () => {
    const sut = main;

    const result = run(sut, ['--phase', 'validation', '--max', max]);

    assert.equal(result.code, EXIT_USAGE);
  });
}

test('Given --max 10, when run, then it is accepted', () => {
  const sut = main;

  const result = run(sut, ['--phase', 'validation', '--max', '10']);

  assert.equal(result.code, 0);
  assert.ok(result.out.includes('Title 001'));
});

test('Given a trailing flag without value after a valid pair, when run, then usage on stderr and exit 2', () => {
  const sut = main;

  const result = run(sut, ['--phase', 'validation', '--dir']);

  assert.equal(result.code, EXIT_USAGE);
  assert.equal(result.out, '');
});

test('Given the default base candidates, when run, then each is probed with a quiet verify', () => {
  const git = fakeGit({ '001-a.md': lessonText() }, { base: 'origin/HEAD' });
  const sut = main;

  run(sut, ['--phase', 'validation'], { git });

  assert.deepEqual(git.calls[0], ['rev-parse', '--verify', '--quiet', 'origin/HEAD']);
});

test('Given no resolvable base, when run, then the note lists every candidate tried', () => {
  const git = fakeGit({}, { base: 'none' });
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { git });

  assert.equal(result.err, 'craft-lessons-hint: no resolvable base revision (tried origin/HEAD, main, master)\n');
});

test('Given a --dir with several trailing slashes, when run, then the pathspec ends with a single slash', () => {
  const git = fakeGit({ '001-a.md': lessonText() }, { base: 'v1', dir: 'custom' });
  const sut = main;

  run(sut, ['--phase', 'validation', '--base', 'v1', '--dir', 'custom//'], { git });

  assert.deepEqual(git.calls.find((a) => a[0] === 'ls-tree'), ['ls-tree', '--name-only', 'v1', '--', 'custom/']);
});

test('Given a whitespace-only line in How to apply, when run, then it is kept out', () => {
  const files = { '001-a.md': lessonText({ howToApply: 'One.\n  \nTwo.' }) };
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { files });

  assert.ok(result.out.endsWith('  One.\n  Two.\n'));
});

test('Given only blank stdin lines and a lesson subject matching everything, when run, then nothing is printed', () => {
  const files = { '001-a.md': lessonText({ subjects: "['**']" }) };
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { files, stdin: '\n  \n' });

  assert.equal(result.out, '');
});

test('Given a padded scope path and an exact-path lesson subject, when run, then the path is trimmed before matching', () => {
  const files = { '001-a.md': lessonText({ subjects: "['engine/src/x.js']" }) };
  const sut = main;

  const result = run(sut, ['--phase', 'validation'], { files, stdin: '  engine/src/x.js  \n' });

  assert.ok(result.out.includes('Title 001'));
});
