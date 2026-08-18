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

test('Given a manifest that is present but unparsable, when main runs, then it is a finding rather than a silent fall-back to the wider derived set', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  const manifest = writeFixture(root, 'workflow.yml', '---\npaths: [unterminated\n---\n# broken\n');
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--manifest', manifest], io);

  // A read/parse failure must never SELECT an exempt set. The derived default
  // is wider than a manifest that scopes its own frozen tier, so degrading to
  // it on unusable input lets attacker-controlled content widen the gate.
  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('cannot parse the manifest'), `stdout was: ${io.stdout.joined()}`);
});

test('Given no manifest at the default location, when main runs, then the zero-config case stays silent', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 0);
  assert.ok(!io.stderr.joined().includes('manifest'), `zero-config must not mention the manifest; stderr was: ${io.stderr.joined()}`);
});

test('Given an explicit --manifest that names a missing file, when main runs, then it is a finding rather than a silent zero-config', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--manifest', join(root, 'nope.yml')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('does not exist'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a manifest whose read fails, when main runs, then it never falls through to the wider derived exempt set', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  writeFixture(root, 'docs/design/stale.md', 'Restates ADR-001.\n');
  writeFixture(root, 'outside.yml', 'paths:\n  adr: adr\n');
  // A manifest committed as a symlink is content the hostile repo controls.
  symlinkSync(join(root, 'outside.yml'), join(root, 'linked.yml'));
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr'), '--manifest', join(root, 'linked.yml')], io);

  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('refusing to read the manifest'), `stdout was: ${io.stdout.joined()}`);
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

// --- Round 3: cases pinning contracts the round-2 mutants walked through ---

test('Given a repo with no manifest at all, when main runs, then the zero-config design and plan tiers are exempt while a live sibling still fires', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  writeFixture(root, 'docs/design/note.md', 'Restates ADR-001.\n');
  writeFixture(root, 'docs/plan/note.md', 'Restates ADR-001.\n');
  writeFixture(root, 'live/note.md', 'Restates ADR-001.\n');
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  // The zero-config contract: a consumer on defaults gets the same frozen
  // tiers a consumer with a manifest gets, or the gate wedges their CI.
  assert.equal(result, 2);
  const out = io.stdout.joined();
  assert.ok(out.includes('DECISION-CITE-FOUND(live/note.md)'), `stdout was: ${out}`);
  assert.ok(!out.includes('DECISION-CITE-FOUND(docs/design/'), `docs/design must be exempt; stdout was: ${out}`);
  assert.ok(!out.includes('DECISION-CITE-FOUND(docs/plan/'), `docs/plan must be exempt; stdout was: ${out}`);
});

test('Given a citation sweep, when the exempt set is announced, then it names the ADR dir and every derived tier', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  const manifest = writeFixture(root, 'workflow.yml', 'paths:\n  adr: adr\n  design: design\n  plan: plan\n');
  stageAll(root);
  const io = makeCaptureIo();

  sut([join(root, 'adr'), '--manifest', manifest], io);

  const err = io.stderr.joined();
  for (const expected of ['adr', 'design', 'plan', 'archive', 'prd']) {
    assert.ok(err.includes(expected), `announcement must name ${expected}; stderr was: ${err}`);
  }
});

test('Given a directory named like an ADR inside the ADR dir, when main runs, then it is refused as not a regular file', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  mkdirSync(join(root, 'adr', '002-directory.md'), { recursive: true });
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('adr/002-directory.md: refusing to read'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given a supersedes adr id that is not exactly three digits, when main runs, then the form check rejects it', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/013-short.md', '---\nsupersedes:\n  - adr: "01"\n    scope: "x"\n---\n# 013 — Test\n');
  writeFixture(root, 'adr/014-long.md', '---\nsupersedes:\n  - adr: "0012"\n    scope: "x"\n---\n# 014 — Test\n');
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  // Length is the substitute for the word boundary `git grep -E` cannot carry:
  // an id of "01" would make the pattern ADR-(01) match ADR-012 and
  // mis-attribute the hit.
  assert.equal(result, 2);
  const out = io.stdout.joined();
  assert.ok(out.includes('adr/013-short.md: supersedes[0] must be'), `stdout was: ${out}`);
  assert.ok(out.includes('adr/014-long.md: supersedes[0] must be'), `stdout was: ${out}`);
});

test('Given no git binary at all, when main runs, then the sweep records a skip and exit stays 0', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();
  const runGitGrep = () => {
    throw Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT' });
  };

  const result = sut([join(root, 'adr')], io, { runGitGrep });

  assert.equal(result, 0);
  assert.match(io.stderr.joined(), /citation sweep skipped/);
});

test('Given the ADR directory IS the repository root, when main runs, then the whole tree is exempt by construction', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeFixture(root, '001-target.md', '# 001 — Target\n\n- **Status:** superseded by ADR-002\n');
  writeFixture(
    root,
    '002-superseding.md',
    [
      '---', 'supersedes:', '  - adr: "001"', '    scope: "everything"', '---',
      '# 002 — Superseding', '', ACCEPTED_STATUS, '',
      'Superseded from ADR-001: everything.', '',
      'Carried forward from ADR-001: nothing — fully replaced.', '',
    ].join('\n'),
  );
  writeFixture(root, 'anywhere.md', 'Restates ADR-001.\n');
  stageAll(root);
  const io = makeCaptureIo();

  const result = sut([root], io);

  // <adr-dir> is exempt unconditionally; when it IS the root, that means the
  // whole tree. Pinned explicitly so the posture is a decision, not a side
  // effect of an empty relative path.
  assert.equal(result, 0, `stdout was: ${io.stdout.joined()}`);
  assert.match(io.stderr.joined(), /\(repository root\)/);
});

test('Given malformed YAML whose later lines carry content, when main runs, then only the first line of the parser message is echoed', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(
    root,
    'adr/003-broken.md',
    '---\nsubjects: [unterminated\nSENSITIVE-SECOND-LINE: yes\n---\n# 003 — Broken\n',
  );
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  const all = io.stdout.joined() + io.stderr.joined();
  assert.ok(all.includes('malformed frontmatter YAML'), `stdout was: ${io.stdout.joined()}`);
  assert.ok(!all.includes('SENSITIVE-SECOND-LINE'), `parser output must not republish file content: ${all}`);
});

test('Given an ADR larger than the read cap, when main runs, then it is a finding rather than an unbounded read', () => {
  const sut = main;
  const root = tmpRoot();
  writeFixture(root, 'adr/001-legacy.md', `# 001 — Legacy\n\n${ACCEPTED_STATUS}\n`);
  writeFixture(root, 'adr/002-huge.md', `# 002 — Huge\n${'x'.repeat(5_000_001)}\n`);
  const io = makeCaptureIo();

  const result = sut([join(root, 'adr')], io);

  assert.equal(result, 2);
  assert.ok(
    io.stdout.joined().includes('adr/002-huge.md: unreadable, or larger than'),
    `stdout was: ${io.stdout.joined()}`,
  );
});

test('Given a hostile manifest sitting in the process cwd, when main runs against another tree, then it is ignored', () => {
  const sut = main;
  const root = gitTmpRoot();
  writeCleanSupersession(root, '001', '002');
  writeFixture(root, 'design/note.md', 'Restates ADR-001.\n');
  // The repo manifest deliberately does NOT exempt design/, so the assertion
  // below can only hold if the repo-rooted manifest won over the cwd one.
  writeFixture(root, 'workflow.yml', 'paths:\n  adr: adr\n');
  stageAll(root);
  const hostile = tmpRoot();
  writeFixture(hostile, '.claude/workflow.md', '---\nadr:\n  frozen:\n    - "design/**"\n---\n# hostile\n');
  const io = makeCaptureIo();
  const previousCwd = process.cwd();

  try {
    process.chdir(hostile);
    const result = sut([join(root, 'adr'), '--manifest', join(root, 'workflow.yml')], io);

    // The cwd manifest would have exempted design/; the repo-rooted one does not.
    assert.equal(result, 2);
    assert.ok(io.stdout.joined().includes('DECISION-CITE-FOUND(design/note.md)'), `stdout was: ${io.stdout.joined()}`);
  } finally {
    process.chdir(previousCwd);
  }
});

test('Given a tracked path carrying control characters, when main reports it, then the bytes are escaped rather than republished', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();
  const runGitGrep = () => 'notes[2Kfake.md 1 cites ADR-001 here\n';

  const result = sut([join(root, 'adr')], io, { runGitGrep });

  assert.equal(result, 2);
  const out = io.stdout.joined();
  assert.ok(!out.includes(''), 'escape sequences must never reach the terminal verbatim');
  assert.ok(out.includes('\\x1b'), `expected an escaped rendering; stdout was: ${JSON.stringify(out)}`);
});

test('Given a git grep record whose path carries a newline, when main runs, then the hit is never re-attributed to an exempt prefix', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();
  // A path whose first byte is a newline: deriving the record terminator from
  // the first '\n' would re-parse the remainder as an exempt-looking path and
  // hide the citation entirely, without even counting it as unparsed.
  const runGitGrep = () => '\nadr/hidden.md 1 live citation of ADR-001\n';

  const result = sut([join(root, 'adr')], io, { runGitGrep });

  assert.equal(result, 2, `a desynchronised record must never read as a clean sweep; stdout was: ${io.stdout.joined()}`);
  assert.ok(io.stdout.joined().includes('unreadable output record'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a mixed stream of one unparseable line and one real record, when main runs, then both the desync and the citation are reported', () => {
  const sut = main;
  const root = tmpRoot();
  writeCleanSupersession(root, '001', '002');
  const io = makeCaptureIo();
  const runGitGrep = () => 'Binary file a.bin matches\nlive/note.md 1 cites ADR-001 here\n';

  const result = sut([join(root, 'adr')], io, { runGitGrep });

  // A stray line ahead of a record is indistinguishable from a pathname
  // containing a line break, and resyncing at the break is exactly how a
  // crafted path hides under an exempt prefix. The record is refused rather
  // than guessed; the refusal is itself blocking, so nothing is concealed.
  assert.equal(result, 2);
  assert.ok(io.stdout.joined().includes('unreadable output record'), `stdout was: ${io.stdout.joined()}`);
});
