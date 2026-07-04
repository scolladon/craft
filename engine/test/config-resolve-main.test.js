/**
 * In-process unit tests for config-resolve: the pure candidate builder plus
 * main()'s two-scope selection walk. Given/When/Then titles, Arrange-Act-Assert
 * bodies, sut variable. Injected deps stand in for the filesystem/home/containment
 * so these tests never read a real $HOME (see config-resolve.bin.test.js for the
 * real-filesystem smoke coverage).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { resolveConfigCandidates, main } from '../src/config-resolve-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const REPO_ROOT = '/repo';
const HOME = '/home/user';
const FAKE_HOME = '/fake/home/user';

function identityContain(_root, target) {
  return target;
}

function candidatePaths(name) {
  const result = resolveConfigCandidates(resolve(process.cwd()), FAKE_HOME, name);
  return { local: result.candidates[0].path, user: result.candidates[1].path };
}

// ─── resolveConfigCandidates: pure candidate builder ─────────────────────────

test('Given a valid kebab name, when resolveConfigCandidates runs, then candidates are ordered [local, user]', () => {
  const sut = resolveConfigCandidates;

  const result = sut(REPO_ROOT, HOME, 'ci');

  assert.equal(result.ok, true);
  assert.equal(result.candidates[0].scope, 'local');
  assert.equal(result.candidates[1].scope, 'user');
});

test('Given a valid kebab name, when resolveConfigCandidates runs, then the local candidate is rooted at repoRoot', () => {
  const sut = resolveConfigCandidates;

  const result = sut(REPO_ROOT, HOME, 'ci');

  assert.equal(result.candidates[0].path, join(REPO_ROOT, '.claude', 'craft-ci.md'));
});

test('Given a valid kebab name, when resolveConfigCandidates runs, then the user candidate is rooted at homeDir (scope-generality)', () => {
  const sut = resolveConfigCandidates;

  const result = sut(REPO_ROOT, HOME, 'ci');

  assert.equal(result.candidates[1].path, join(HOME, '.claude', 'craft-ci.md'));
});

test('Given the same name and two roots, when resolveConfigCandidates runs, then both candidates share the craft-<name>.md tail', () => {
  const sut = resolveConfigCandidates;

  const result = sut(REPO_ROOT, HOME, 'my-config');

  const tail = join('.claude', 'craft-my-config.md');
  assert.ok(result.candidates[0].path.endsWith(tail), `local was: ${result.candidates[0].path}`);
  assert.ok(result.candidates[1].path.endsWith(tail), `user was: ${result.candidates[1].path}`);
});

test('Given an invalid name "UpperCase", when resolveConfigCandidates runs, then ok:false with a single propagated error', () => {
  const sut = resolveConfigCandidates;

  const result = sut(REPO_ROOT, HOME, 'UpperCase');

  assert.equal(result.ok, false);
  assert.ok(result.error.includes('UpperCase'), `error was: ${result.error}`);
});

test('Given a traversal name "../escape", when resolveConfigCandidates runs, then ok:false', () => {
  const sut = resolveConfigCandidates;

  const result = sut(REPO_ROOT, HOME, '../escape');

  assert.equal(result.ok, false);
});

test('Given an empty name, when resolveConfigCandidates runs, then ok:false', () => {
  const sut = resolveConfigCandidates;

  const result = sut(REPO_ROOT, HOME, '');

  assert.equal(result.ok, false);
});

// ─── main: existence-selection edge matrix ───────────────────────────────────

test('Given both local and user configs present, when main runs, then stdout is the absolute local path, stderr carries the shadow note, and exit is 0', () => {
  const sut = main;
  const io = makeCaptureIo();
  const { local, user } = candidatePaths('ci');
  const deps = {
    homeDir: () => FAKE_HOME,
    fileExists: (p) => p === local || p === user,
    containByRealpath: identityContain,
  };

  const result = sut(['ci'], io, deps);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), `${local}\n`);
  assert.ok(io.stderr.joined().includes('shadowed by local'), `stderr: ${io.stderr.joined()}`);
});

test('Given only a local config present, when main runs, then stdout is the absolute local path with no note and exit is 0', () => {
  const sut = main;
  const io = makeCaptureIo();
  const { local } = candidatePaths('ci');
  const deps = {
    homeDir: () => FAKE_HOME,
    fileExists: (p) => p === local,
    containByRealpath: identityContain,
  };

  const result = sut(['ci'], io, deps);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), `${local}\n`);
  assert.equal(io.stderr.joined(), '', 'stderr must be silent when only local is present');
});

test('Given only a user config present, when main runs, then stdout is the absolute user path, stderr carries the user-scope note, and exit is 0', () => {
  const sut = main;
  const io = makeCaptureIo();
  const { user } = candidatePaths('ci');
  const deps = {
    homeDir: () => FAKE_HOME,
    fileExists: (p) => p === user,
    containByRealpath: identityContain,
  };

  const result = sut(['ci'], io, deps);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), `${user}\n`);
  assert.ok(io.stderr.joined().includes('resolved at user scope'), `stderr: ${io.stderr.joined()}`);
  assert.ok(!io.stderr.joined().includes('shadowed by local'), `a user-scope win with local absent must never carry the local-shadow note: ${io.stderr.joined()}`);
});

test('Given neither scope has the config, when main runs, then it returns non-zero, stdout is empty, and stderr names both scopes', () => {
  const sut = main;
  const io = makeCaptureIo();
  const deps = {
    homeDir: () => FAKE_HOME,
    fileExists: () => false,
    containByRealpath: identityContain,
  };

  const result = sut(['ci'], io, deps);

  assert.notEqual(result, 0);
  assert.equal(io.stdout.joined(), '');
  assert.ok(io.stderr.joined().includes('./.claude/craft-ci.md'), `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stderr.joined().includes('~/.claude/craft-ci.md'), `stderr: ${io.stderr.joined()}`);
});

// ─── main: missing / bad name ─────────────────────────────────────────────────

test('Given no name argument, when main runs, then returns non-zero and stderr mentions name argument required', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io, {});

  assert.notEqual(result, 0);
  assert.ok(io.stderr.joined().includes('name argument required'), `stderr: ${io.stderr.joined()}`);
});

test('Given an invalid name "MyBad", when main runs, then returns non-zero and stderr echoes the rejected name', () => {
  const sut = main;
  const io = makeCaptureIo();
  const deps = { homeDir: () => FAKE_HOME };

  const result = sut(['MyBad'], io, deps);

  assert.notEqual(result, 0);
  assert.ok(io.stderr.joined().includes('MyBad'), `stderr: ${io.stderr.joined()}`);
});

// ─── main: containment-null user candidate is treated as ABSENT, never an error ──

test('Given a present local config and a containment-null user candidate, when main runs, then local still wins with no shadow note', () => {
  const sut = main;
  const io = makeCaptureIo();
  const { local, user } = candidatePaths('ci');
  const deps = {
    homeDir: () => FAKE_HOME,
    fileExists: (p) => p === local || p === user,
    containByRealpath: () => null,
  };

  const result = sut(['ci'], io, deps);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), `${local}\n`);
  assert.equal(io.stderr.joined(), '', 'a containment-null user must not be treated as present');
});

test('Given an absent local config and a containment-null user candidate, when main runs, then it falls through to the neither-found STOP naming both scopes', () => {
  const sut = main;
  const io = makeCaptureIo();
  const { user } = candidatePaths('ci');
  const deps = {
    homeDir: () => FAKE_HOME,
    fileExists: (p) => p === user,
    containByRealpath: () => null,
  };

  const result = sut(['ci'], io, deps);

  assert.notEqual(result, 0);
  assert.ok(io.stderr.joined().includes('./.claude/craft-ci.md'), `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stderr.joined().includes('~/.claude/craft-ci.md'), `stderr: ${io.stderr.joined()}`);
});

// ─── containByRealpath call: exact root argument (mutation-hardening) ────────

test('Given user-scope resolution, when main runs, then containByRealpath is called with the ~/.claude root, not a bare-home root', () => {
  const sut = main;
  const io = makeCaptureIo();
  const roots = [];
  const containByRealpath = (root, target) => { roots.push(root); return target; };
  const deps = { homeDir: () => FAKE_HOME, fileExists: () => false, containByRealpath };

  sut(['ci'], io, deps);

  assert.equal(roots.length, 1, 'containByRealpath must be called exactly once, for the user candidate');
  assert.equal(roots[0], join(FAKE_HOME, '.claude'));
});

// ─── containment-null user, fileExists unconditionally true: user still ABSENT ─

test('Given a containment-null user candidate even when fileExists is unconditionally true, when main runs, then the user candidate is treated absent (no shadow note leaks through)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const { local } = candidatePaths('ci');
  const deps = { homeDir: () => FAKE_HOME, fileExists: () => true, containByRealpath: () => null };

  const result = sut(['ci'], io, deps);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), `${local}\n`);
  assert.equal(io.stderr.joined(), '', 'a containment-null user candidate must never be treated as present, regardless of fileExists');
});
