/**
 * `adr-lint` — the whole-corpus C0–C3 gate over ADR supersession declarations:
 * C0 declaration form, C1 target status flip, C2 scope-stated-both-directions,
 * C3 live-tier citation sweep. Mirrors `intention-lint-main.test.js`'s
 * mkdtempSync-per-case fixture idiom. C3 cases build a real throwaway git repo
 * (the `tmp-git-repo.js` recipe, re-implemented locally per the plan) since a
 * committed fixture citing a superseded ADR would trip the real-tree sweep.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { main } from '../src/adr-lint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const tmpDirs = [];
after(() => tmpDirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

// A bare `.git` marker so `findRepoRoot` resolves to the fixture root rather
// than walking out to whatever ambient checkout $TMPDIR happens to sit in.
// That makes reported paths genuinely repo-relative, keeps the default
// manifest lookup inside the fixture (hermetic), and makes `git grep` fail
// deterministically as "not a git repository" — the environmental skip.
function tmpRoot() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adrlint-')));
  tmpDirs.push(dir);
  mkdirSync(join(dir, '.git'), { recursive: true });
  return dir;
}

function writeFixture(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

// Local re-implementation of test/helpers/tmp-git-repo.js's seven-line recipe
// (that helper is CommonJS in the root suite; this suite is ESM). Realpath the
// root — on macOS $TMPDIR is itself a symlink, and every downstream path
// comparison silently mismatches without it.
function gitTmpRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'adrlint-git-'));
  tmpDirs.push(dir);
  return realpathSync(dir);
}

function runGit(root, ...args) {
  return execFileSync(
    'git',
    ['-C', root, '-c', 'user.email=adrlint-test@example.com', '-c', 'user.name=adrlint-test', ...args],
    { encoding: 'utf8' },
  );
}

function stageAll(root) {
  runGit(root, 'init', '-q');
  runGit(root, 'add', '-A');
}

const ACCEPTED_STATUS = '- **Status:** accepted';

test('Given an ADR with no frontmatter fence, when main runs, then it exits 0 with no finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stdout.joined().includes('adr/001-legacy.md'), `unexpected finding: ${io.stdout.joined()}`);
});

test('Given a present fence with malformed YAML, when main runs, then it exits 2 with a finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/002-broken.md', '---\nsubjects: [unterminated\n---\n# 002 — Broken\n');
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('adr/002-broken.md'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a fence where subjects is a string not a list, when main runs, then it exits 2 with a finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/003-string-subjects.md', '---\nsubjects: "just a string"\n---\n# 003 — Test\n');
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('subjects must be a list'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a fence where subjects has an empty-string element, when main runs, then it exits 2 with a finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/004-empty-subject.md', '---\nsubjects:\n  - ""\n  - foo\n---\n# 004 — Test\n');
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('subjects must be a list'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a supersedes entry missing scope, when main runs, then it exits 2 with a finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/005-missing-scope.md', '---\nsupersedes:\n  - adr: "001"\n---\n# 005 — Test\n');
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('supersedes[0]'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a supersedes entry with a whitespace-only scope, when main runs, then it exits 2 with a finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(
    root,
    'adr/006-blank-scope.md',
    '---\nsupersedes:\n  - adr: "001"\n    scope: "   "\n---\n# 006 — Test\n',
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('supersedes[0]'), `stdout was: ${io.stdout.joined()}`);
});

test('Given supersedes adr written unpadded as a bare number, when main runs, then it exits 2 with a C0 finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/050-target.md', `# 050 — Target\n\n${ACCEPTED_STATUS}\n`);
  writeFixture(
    root,
    'adr/007-unpadded.md',
    '---\nsupersedes:\n  - adr: 50\n    scope: "something"\n---\n# 007 — Test\n',
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('adr/007-unpadded.md'), `stdout was: ${io.stdout.joined()}`);
  assert.ok(io.stdout.joined().includes('supersedes[0]'), `stdout was: ${io.stdout.joined()}`);
});

test('Given the target ADR Status line still reads accepted, when main runs, then it exits 2 with a C1 finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-target.md', `# 001 — Target\n\n${ACCEPTED_STATUS}\n`);
  writeFixture(
    root,
    'adr/002-superseding.md',
    [
      '---',
      'supersedes:',
      '  - adr: "001"',
      '    scope: "everything"',
      '---',
      '# 002 — Superseding',
      '',
      '- **Status:** accepted',
      '',
      'Superseded from ADR-001: everything.',
      '',
      'Carried forward from ADR-001: nothing — fully replaced.',
      '',
    ].join('\n'),
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('adr/001-target.md'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a supersedes target number that resolves to no file, when main runs, then it exits 2 with a C1 finding and does not crash', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(
    root,
    'adr/008-dangling.md',
    [
      '---',
      'supersedes:',
      '  - adr: "999"',
      '    scope: "everything"',
      '---',
      '# 008 — Dangling',
      '',
      ACCEPTED_STATUS,
      '',
      'Superseded from ADR-999: everything.',
      '',
      'Carried forward from ADR-999: nothing — fully replaced.',
      '',
    ].join('\n'),
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('adr/008-dangling.md'), `stdout was: ${io.stdout.joined()}`);
});

test('Given two files sharing the target filename prefix, when main runs, then it exits 2 with a C1 finding and does not crash', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-a.md', `# 001 — A\n\n${ACCEPTED_STATUS}\n`);
  writeFixture(root, 'adr/001-b.md', `# 001 — B\n\n${ACCEPTED_STATUS}\n`);
  writeFixture(
    root,
    'adr/009-ambiguous.md',
    [
      '---',
      'supersedes:',
      '  - adr: "001"',
      '    scope: "everything"',
      '---',
      '# 009 — Ambiguous',
      '',
      ACCEPTED_STATUS,
      '',
      'Superseded from ADR-001: everything.',
      '',
      'Carried forward from ADR-001: nothing — fully replaced.',
      '',
    ].join('\n'),
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('adr/009-ambiguous.md'), `stdout was: ${io.stdout.joined()}`);
});

test('Given "Superseded from" present but "Carried forward from" absent, when main runs, then it exits 2 with a C2 finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-target.md', `# 001 — Target\n\n- **Status:** superseded by ADR-010\n`);
  writeFixture(
    root,
    'adr/010-superseding.md',
    [
      '---',
      'supersedes:',
      '  - adr: "001"',
      '    scope: "everything"',
      '---',
      '# 010 — Superseding',
      '',
      ACCEPTED_STATUS,
      '',
      'Superseded from ADR-001: everything.',
      '',
    ].join('\n'),
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('adr/010-superseding.md'), `stdout was: ${io.stdout.joined()}`);
  assert.ok(io.stdout.joined().includes('Carried forward'), `stdout was: ${io.stdout.joined()}`);
});

test('Given both anchors present with "Carried forward from ADR-N: nothing — <why>", when main runs, then it passes', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-target.md', `# 001 — Target\n\n- **Status:** superseded by ADR-011\n`);
  writeFixture(
    root,
    'adr/011-superseding.md',
    [
      '---',
      'supersedes:',
      '  - adr: "001"',
      '    scope: "everything"',
      '---',
      '# 011 — Superseding',
      '',
      ACCEPTED_STATUS,
      '',
      'Superseded from ADR-001: everything.',
      '',
      'Carried forward from ADR-001: nothing — fully replaced.',
      '',
    ].join('\n'),
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 0, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
});

test('Given a comma-continuation anchor "Carried forward from ADR-N, unchanged and …:", when main runs, then it passes (prefix match, not colon match)', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-target.md', `# 001 — Target\n\n- **Status:** superseded by ADR-012\n`);
  writeFixture(
    root,
    'adr/012-superseding.md',
    [
      '---',
      'supersedes:',
      '  - adr: "001"',
      '    scope: "everything"',
      '---',
      '# 012 — Superseding',
      '',
      ACCEPTED_STATUS,
      '',
      'Carried forward from ADR-001, unchanged and now stated tool-independently:',
      '',
      '- a fact.',
      '',
      'Superseded from ADR-001: every other mention.',
      '',
    ].join('\n'),
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 0, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
});

test('Given an anchor present but naming a different ADR, when main runs, then it exits 2 with a C2 finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-target.md', `# 001 — Target\n\n- **Status:** superseded by ADR-013\n`);
  writeFixture(
    root,
    'adr/013-superseding.md',
    [
      '---',
      'supersedes:',
      '  - adr: "001"',
      '    scope: "everything"',
      '---',
      '# 013 — Superseding',
      '',
      ACCEPTED_STATUS,
      '',
      'Superseded from ADR-999: wrong target.',
      '',
      'Carried forward from ADR-001: nothing — fully replaced.',
      '',
    ].join('\n'),
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('adr/013-superseding.md'), `stdout was: ${io.stdout.joined()}`);
  assert.ok(io.stdout.joined().includes('Superseded'), `stdout was: ${io.stdout.joined()}`);
});

function writeCleanSupersession(root, targetId, superId) {
  writeFixture(root, `adr/${targetId}-target.md`, `# ${targetId} — Target\n\n- **Status:** superseded by ADR-${superId}\n`);
  writeFixture(
    root,
    `adr/${superId}-superseding.md`,
    [
      '---',
      'supersedes:',
      `  - adr: "${targetId}"`,
      '    scope: "everything"',
      '---',
      `# ${superId} — Superseding`,
      '',
      ACCEPTED_STATUS,
      '',
      `Superseded from ADR-${targetId}: everything.`,
      '',
      `Carried forward from ADR-${targetId}: nothing — fully replaced.`,
      '',
    ].join('\n'),
  );
}

test('Given a live-tier citation of a superseded ADR outside the exempt set, when main runs, then it exits 2 with one C3 finding per hit', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  writeFixture(root, 'live/example.md', 'See ADR-001 for details.\n');
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('DECISION-CITE-FOUND(live/example.md): ADR-001@L1'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given the same citation under each manifest-derived exempt path, when main runs, then it passes', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  writeFixture(root, 'design/note.md', 'Restates ADR-001.\n');
  writeFixture(root, 'plan/note.md', 'Restates ADR-001.\n');
  writeFixture(root, 'archive/note.md', 'Restates ADR-001.\n');
  writeFixture(root, 'prd/note.md', 'Restates ADR-001.\n');
  const manifest = writeFixture(root, 'workflow.yml', 'paths:\n  adr: adr\n  design: design\n  plan: plan\n');
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--manifest', manifest], io);

  assert.equal(result, 0, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
});

test('Given a matching DECISION-CITE-WAIVE token in a waiver source, when main runs, then the citation finding is waived', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  const live = writeFixture(root, 'live/example.md', 'See ADR-001 for details.\n');
  const waiverSource = writeFixture(root, 'waiver.md', `DECISION-CITE-WAIVE(${live}): tracked elsewhere\n`);
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--waiver-source', waiverSource], io);

  assert.equal(result, 0, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
});

test('Given citations only inside the superseding ADR and its target, when main runs, then it passes — the sweep never self-flags', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 0, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
});

test('Given two ADRs superseding two targets each with a live citation, when main runs, then both are swept and findings are attributed per target', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '003');
  writeCleanSupersession(root, '002', '004');
  writeFixture(root, 'live/one.md', 'See ADR-001 for details.\n');
  writeFixture(root, 'live/two.md', 'See ADR-002 for details.\n');
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  const out = io.stdout.joined();
  assert.ok(out.includes('DECISION-CITE-FOUND(live/one.md): ADR-001@L1'), `stdout was: ${out}`);
  assert.ok(out.includes('DECISION-CITE-FOUND(live/two.md): ADR-002@L1'), `stdout was: ${out}`);
});

test('Given adr.frozen present in the manifest, when main runs, then it replaces the derived set while the ADR dir stays exempt', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  writeFixture(root, 'frozen/note.md', 'Restates ADR-001.\n');
  writeFixture(root, 'design/note.md', 'Restates ADR-001.\n');
  // paths.design is declared so "replaces" is observable: under the DERIVED
  // branch design/ would be exempt, so flagging it can only mean frozen won.
  const manifest = writeFixture(
    root,
    'workflow.yml',
    'paths:\n  design: design\nadr:\n  frozen:\n    - "frozen/**"\n',
  );
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--manifest', manifest], io);

  assert.equal(result, 2);
  const out = io.stdout.joined();
  assert.ok(!out.includes('frozen/note.md'), `stdout was: ${out}`);
  assert.ok(out.includes('DECISION-CITE-FOUND(design/note.md)'), `stdout was: ${out}`);
  assert.ok(!out.includes('DECISION-CITE-FOUND(adr/'), `the ADR dir must stay exempt; stdout was: ${out}`);
});

test('Given adr.frozen as an empty list, when main runs, then nothing but the ADR dir is exempt', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  writeFixture(root, 'design/note.md', 'Restates ADR-001.\n');
  const manifest = writeFixture(
    root,
    'workflow.yml',
    'paths:\n  design: design\nadr:\n  frozen: []\n',
  );
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--manifest', manifest], io);

  assert.equal(result, 2);
  const out = io.stdout.joined();
  assert.ok(out.includes('DECISION-CITE-FOUND(design/note.md)'), `stdout was: ${out}`);
  assert.ok(!out.includes('DECISION-CITE-FOUND(adr/'), `the ADR dir must stay exempt; stdout was: ${out}`);
});

test('Given a tree with no git, when main runs a citation sweep, then it records a skip on stderr and exit stays 0', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 0, `stdout: ${io.stdout.joined()}`);
  assert.ok(!io.stdout.joined().includes('DECISION-CITE-FOUND'), `stdout was: ${io.stdout.joined()}`);
  assert.notEqual(io.stderr.joined(), '', 'expected a recorded skip on stderr');
});

test('Given zero ADRs declaring supersedes, when main runs, then no git grep process is spawned and it exits 0', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-plain.md', `# 001 — Plain\n\n${ACCEPTED_STATUS}\n`);
  const io = makeCaptureIo();
  let calls = 0;
  const deps = { runGitGrep: () => { calls += 1; return ''; } };

  const result = sut([join(root, 'adr')], io, deps);

  assert.equal(result, 0, `stdout: ${io.stdout.joined()} stderr: ${io.stderr.joined()}`);
  assert.equal(calls, 0);
});

test('Given zero arguments, when main runs, then it prints usage on stderr and exits 2', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('usage'), `stderr was: ${io.stderr.joined()}`);
});

test('Given an adr-dir argument that is not a directory, when main runs, then it prints usage on stderr and exits 2', () => {
  const sut = main;
  const root = tmpRoot();
  const notADir = writeFixture(root, 'not-a-dir.md', 'plain file\n');
  const io = makeCaptureIo();

  const result = sut([notADir], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('usage'), `stderr was: ${io.stderr.joined()}`);
});

test('Given a clean directory of legacy ADRs, when main runs, then it exits 0 and prints the craft-adr: OK line', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  writeFixture(root, 'adr/002-legacy.md', `# 002 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.match(io.stdout.joined(), /^craft-adr: OK — 2 ADR\(s\) checked, 0 declaring supersession\.$/m);
});

// --- Review round: cases whose absence let a real mutant survive ---

test('Given a target whose Status names a DIFFERENT superseder, when main runs, then C1 still reports it missing', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-target.md', '# 001 — Target\n\n- **Status:** superseded by ADR-999\n');
  writeFixture(
    root,
    'adr/010-superseding.md',
    [
      '---', 'supersedes:', '  - adr: "001"', '    scope: "everything"', '---',
      '# 010 — Superseding', '', ACCEPTED_STATUS, '',
      'Superseded from ADR-001: everything.', '',
      'Carried forward from ADR-001: nothing — fully replaced.', '',
    ].join('\n'),
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('missing required line: - **Status:** superseded by ADR-010'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given both C2 anchors present only mid-line, when main runs, then it reports two C2 findings', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-target.md', '# 001 — Target\n\n- **Status:** superseded by ADR-011\n');
  writeFixture(
    root,
    'adr/011-superseding.md',
    [
      '---', 'supersedes:', '  - adr: "001"', '    scope: "everything"', '---',
      '# 011 — Superseding', '', ACCEPTED_STATUS, '',
      'The rule is Superseded from ADR-001 and Carried forward from ADR-001 as noted above.', '',
    ].join('\n'),
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  const out = io.stdout.joined();
  assert.ok(out.includes('missing a line starting "Superseded from ADR-001"'), `stdout was: ${out}`);
  assert.ok(out.includes('missing a line starting "Carried forward from ADR-001"'), `stdout was: ${out}`);
});

test('Given supersedes written as a bare string rather than a list, when main runs, then it reports the list-form finding', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/007-string.md', '---\nsupersedes: "001"\n---\n# 007 — Test\n');
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('supersedes must be a list'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a supersedes adr id carrying a newline, when main runs, then the form check rejects it before it can reach the sweep pattern', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/012-inject.md', '---\nsupersedes:\n  - adr: "001\\n("\n    scope: "x"\n---\n# 012 — Test\n');
  let sweeps = 0;
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io, { runGitGrep: () => { sweeps += 1; return ''; } });

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('supersedes[0] must be'), `stdout was: ${io.stdout.joined()}`);
  assert.equal(sweeps, 0, 'an invalid id must never reach the git grep pattern');
});

test('Given an exempt-path fixture, when main runs, then a non-exempt sibling citation still reports — the sweep was live', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  for (const dir of ['design', 'plan', 'archive', 'prd']) {
    writeFixture(root, `${dir}/note.md`, 'Restates ADR-001.\n');
  }
  writeFixture(root, 'live/note.md', 'Restates ADR-001.\n');
  const manifest = writeFixture(
    root,
    'workflow.yml',
    'paths:\n  adr: adr\n  design: design\n  plan: plan\n',
  );
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--manifest', manifest], io);

  // The positive control: exit 2 on the ONE live hit proves the exemptions
  // above are exemptions, not a sweep that saw nothing at all.
  assert.equal(result, 2);
  const out = io.stdout.joined();
  assert.ok(out.includes('DECISION-CITE-FOUND(live/note.md): ADR-001@L1'), `stdout was: ${out}`);
  for (const dir of ['design', 'plan', 'archive', 'prd', 'adr']) {
    assert.ok(!out.includes(`DECISION-CITE-FOUND(${dir}/`), `${dir}/ must be exempt; stdout was: ${out}`);
  }
});

test('Given a git grep that fails for a non-environmental reason, when main runs, then it is a finding rather than a silent pass', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();
  const runGitGrep = () => {
    throw Object.assign(new Error('spawnSync git ENOBUFS'), { code: 'ENOBUFS', status: null });
  };

  const result = sut([join(root, 'adr')], io, { runGitGrep });

  assert.equal(result, 2, 'a blocking gate must not have a silent pass path');
  assert.ok(io.stdout.joined().includes('citation sweep failed'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a git grep reporting no matches with exit 1, when main runs, then it exits 0 with no skip recorded', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();
  const runGitGrep = () => {
    throw Object.assign(new Error('no matches'), { status: 1 });
  };

  const result = sut([join(root, 'adr')], io, { runGitGrep });

  assert.equal(result, 0);
  assert.ok(!io.stderr.joined().includes('skipped'), `stderr was: ${io.stderr.joined()}`);
});

test('Given a tree that is not a git repository, when main runs, then the sweep records a skip and exit stays 0', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();
  const runGitGrep = () => {
    throw Object.assign(new Error('fatal'), {
      status: 128,
      stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
    });
  };

  const result = sut([join(root, 'adr')], io, { runGitGrep });

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /citation sweep skipped/);
});

test('Given git grep output carrying an unparseable record, when main runs, then it is surfaced rather than dropped', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();
  const runGitGrep = () => 'Binary file live/blob.bin matches\n';

  const result = sut([join(root, 'adr')], io, { runGitGrep });

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('unreadable output record'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a filename containing a colon, when main runs, then the NUL-delimited record still attributes the hit to the whole path', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();
  // git grep -z emits path\0lineno\0content — a colon in the path is only safe
  // because the delimiter is NUL, never the colon a naive parser would split on.
  const runGitGrep = () => 'weird:name/live.md 1 cites ADR-001 here\n';

  const result = sut([join(root, 'adr')], io, { runGitGrep });

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('DECISION-CITE-FOUND(weird:name/live.md): ADR-001@L1'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given a committed symlink in the ADR directory, when main runs, then it refuses to read it rather than following it out of the tree', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  writeFixture(root, 'outside.md', 'secret-first-line: yes\n');
  symlinkSync(join(root, 'outside.md'), join(root, 'adr', '900-link.md'));
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  const out = io.stdout.joined();
  assert.ok(out.includes('adr/900-link.md: refusing to read'), `stdout was: ${out}`);
  assert.ok(!out.includes('secret-first-line'), `content must never be echoed; stdout was: ${out}`);
});

test('Given a malformed manifest, when main runs, then it degrades to no-config with a loud stderr line and never crashes', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  const manifest = writeFixture(root, 'workflow.yml', '---\npaths: [unterminated\n---\n# broken\n');
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--manifest', manifest], io);

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /cannot parse/);
});

test('Given a trailing --manifest with no value, when main runs, then it reports a usage error rather than silently ignoring it', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--manifest'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /--manifest requires a value/);
});

test('Given a surplus positional argument, when main runs, then it reports a usage error', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), 'extra'], io);

  assert.equal(result, 2);
  assert.match(io.stderr.joined(), /unexpected argument: extra/);
});

test('Given a repo-relative DECISION-CITE-WAIVE, when main runs, then the waiver matches the hit it names', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  writeFixture(root, 'live/note.md', 'Restates ADR-001.\n');
  const waiverSource = writeFixture(
    root,
    'waivers.md',
    'DECISION-CITE-WAIVE(live/note.md): deliberate historical quote\n',
  );
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--waiver-source', waiverSource], io);

  assert.equal(result, 0, `stdout was: ${io.stdout.joined()}`);
});

test('Given any citation sweep, when main runs, then the resolved exempt set is announced so an over-broad entry cannot hide', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  stageAll(root);
  const io = makeCaptureIo();

  sut([join(root, 'adr')], io);

  assert.match(io.stderr.joined(), /citation sweep exempts \(derived\):/);
});
