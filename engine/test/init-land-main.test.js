/**
 * In-process unit tests for init-land-main: scope routing (local vs user), shadow-warn,
 * containment-null STOP, bad --scope, and lint-fail delegation to land(). Injected deps
 * stand in for the filesystem/home/containment so these tests never touch a real $HOME
 * (see init-land.bin.test.js for the real-filesystem smoke coverage, including the
 * ref-bearing-config-rejected-at-$HOME portability pin).
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { main, buildLintDep } from '../src/init-land-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const FAKE_HOME = '/fake/home/user';

function passingLint() {
  return () => ({ exitCode: 0, errors: [] });
}

function failingLint(errors) {
  return () => ({ exitCode: 2, errors: errors ?? ['lint: manifest invalid'] });
}

function renameSpy() {
  const calls = [];
  const rename = (from, to) => { calls.push({ from, to }); };
  return { rename, calls };
}

function identityContain(_root, target) {
  return target;
}

function baseDeps(overrides = {}) {
  return {
    homeDir: () => FAKE_HOME,
    fileExists: () => false,
    containByRealpath: identityContain,
    lint: passingLint(),
    rename: () => {},
    ...overrides,
  };
}

function containSpy() {
  const calls = [];
  return {
    contain: (root, target) => {
      calls.push({ root, target });
      return target;
    },
    calls,
  };
}

// ─── local scope: finalPath rooted at cwd ────────────────────────────────────

test('Given local scope, when main runs, then finalPath is <cwd>/.claude/craft-<name>.md and exit is 0', () => {
  const sut = main;
  const io = makeCaptureIo();
  const spy = renameSpy();

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'local'], io, baseDeps({ rename: spy.rename }));

  const expected = join(resolve(process.cwd()), '.claude', 'craft-ci.md');
  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(spy.calls[0].to, expected);
  assert.equal(io.stdout.joined(), `${expected}\n`);
});

test('Given no --scope flag, when main runs, then it defaults to local scope', () => {
  const sut = main;
  const io = makeCaptureIo();
  const spy = renameSpy();

  const result = sut(['/tmp/x.tmp', 'ci'], io, baseDeps({ rename: spy.rename }));

  const expected = join(resolve(process.cwd()), '.claude', 'craft-ci.md');
  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(spy.calls[0].to, expected);
});

test('Given local scope, when main runs, then containment is never consulted', () => {
  const sut = main;
  const io = makeCaptureIo();
  const spy = containSpy();

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'local'], io, baseDeps({ containByRealpath: spy.contain }));

  assert.equal(result, 0, io.stderr.joined());
  assert.equal(spy.calls.length, 0, 'local scope must not consult containment');
});

test('Given user scope, when main runs, then containment is consulted with the ~/.claude root', () => {
  const sut = main;
  const io = makeCaptureIo();
  const spy = containSpy();

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'user'], io, baseDeps({ containByRealpath: spy.contain }));

  assert.equal(result, 0, io.stderr.joined());
  assert.equal(spy.calls[0].root, join(FAKE_HOME, '.claude'));
});

// ─── user scope: finalPath rooted at homeDir ─────────────────────────────────

test('Given user scope, when main runs, then finalPath is <homeDir>/.claude/craft-<name>.md and exit is 0', () => {
  const sut = main;
  const io = makeCaptureIo();
  const spy = renameSpy();

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'user'], io, baseDeps({ rename: spy.rename }));

  const expected = join(FAKE_HOME, '.claude', 'craft-ci.md');
  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(spy.calls[0].to, expected);
  assert.equal(io.stdout.joined(), `${expected}\n`);
});

// ─── shadow-warn: user scope + local sibling present ─────────────────────────

test('Given user scope and a local same-name config present, when main runs, then stderr carries the shadow-warn note and the move still proceeds', () => {
  const sut = main;
  const io = makeCaptureIo();
  const localPath = join(resolve(process.cwd()), '.claude', 'craft-ci.md');
  const spy = renameSpy();
  const deps = baseDeps({ rename: spy.rename, fileExists: (p) => p === localPath });

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'user'], io, deps);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stderr.joined().includes('shadow'), `stderr: ${io.stderr.joined()}`);
  assert.equal(spy.calls.length, 1, 'move must still proceed despite the shadow warning');
});

test('Given user scope and no local same-name config, when main runs, then stderr carries no shadow-warn note', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'user'], io, baseDeps({ fileExists: () => false }));

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stderr.joined(), '', 'no shadow-warn note expected when no local sibling exists');
});

test('Given local scope and a same-name config present, when main runs, then no shadow-warn is emitted (local scope never shadow-warns)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'local'], io, baseDeps({ fileExists: () => true }));

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stderr.joined(), '', 'shadow-warn is a user-scope-only concern');
});

// ─── containment-null user: STOP, rename never called ────────────────────────

test('Given user scope with a containment-null result (symlinked ~/.claude), when main runs, then it returns non-zero and rename is never called', () => {
  const sut = main;
  const io = makeCaptureIo();
  const spy = renameSpy();
  const deps = baseDeps({ rename: spy.rename, containByRealpath: () => null });

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'user'], io, deps);

  assert.notEqual(result, 0);
  assert.equal(spy.calls.length, 0, 'rename must not be called when containment fails');
  assert.ok(io.stderr.joined().includes('containment'), io.stderr.joined());
});

// ─── unknown --scope ──────────────────────────────────────────────────────────

test('Given an unknown --scope value, when main runs, then it returns non-zero with a stderr diagnostic', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'global'], io, baseDeps());

  assert.notEqual(result, 0);
  assert.ok(io.stderr.joined().includes('global'), io.stderr.joined());
  assert.ok(io.stderr.joined().includes('must be one of local, user'), `diagnostic must enumerate the valid scopes, comma-separated: ${io.stderr.joined()}`);
});

// ─── missing args ─────────────────────────────────────────────────────────────

test('Given no argv, when main runs, then it returns non-zero with a usage message on stderr', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io, baseDeps());

  assert.notEqual(result, 0);
  assert.match(io.stderr.joined(), /usage/i);
});

test('Given a tmpPath but no name, when main runs, then it returns non-zero with a usage message on stderr', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['/tmp/x.tmp'], io, baseDeps());

  assert.notEqual(result, 0);
  assert.match(io.stderr.joined(), /usage/i);
});

// ─── invalid name: defensive re-validation ───────────────────────────────────

test('Given an invalid name, when main runs, then it returns non-zero with a stderr diagnostic', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['/tmp/x.tmp', 'Bad_Name'], io, baseDeps());

  assert.notEqual(result, 0);
  assert.ok(io.stderr.joined().includes('Bad_Name'), io.stderr.joined());
});

// ─── lint-fail delegation ─────────────────────────────────────────────────────

test('Given lint fails on the tmp file, when main runs, then it returns non-zero and rename is never called (delegates to land)', () => {
  const sut = main;
  const io = makeCaptureIo();
  const spy = renameSpy();
  const deps = baseDeps({ rename: spy.rename, lint: failingLint(['manifest error']) });

  const result = sut(['/tmp/x.tmp', 'ci', '--scope', 'local'], io, deps);

  assert.notEqual(result, 0);
  assert.equal(spy.calls.length, 0, 'rename must not be called on lint failure');
  assert.ok(io.stderr.joined().includes('manifest error'), `stderr: ${io.stderr.joined()}`);
});

// ─── buildLintDep(): real bash+manifest-lint.sh wiring ───────────────────────
// Exercises the default lint dependency in-process (no fake injected) so Stryker's
// instrumentation can observe it; the .bin.test.js suite covers the same script
// through the compiled CLI, but that subprocess boundary is invisible to mutation
// testing run in-process.

function makeLintTmpDir() {
  const dir = mkdtempSync(join(tmpdir(), 'init-land-lintdep-'));
  mkdirSync(join(dir, '.claude'));
  return dir;
}

test('Given a lint-clean manifest tmp, when the real buildLintDep() lint runs, then it returns exitCode 0 with no errors', () => {
  const sut = buildLintDep();
  const dir = makeLintTmpDir();
  const tmpPath = join(dir, '.claude', '.craft-x.tmp');
  writeFileSync(tmpPath, '# named config — no frontmatter, pure defaults\n');

  const result = sut(tmpPath);

  assert.deepEqual(result, { exitCode: 0, errors: [] });
  rmSync(dir, { recursive: true, force: true });
});

test('Given a ref-bearing manifest tmp whose reference is missing, when the real buildLintDep() lint runs, then it returns the real lint exitCode and the trimmed non-empty stderr lines as errors', () => {
  const sut = buildLintDep();
  const dir = makeLintTmpDir();
  const tmpPath = join(dir, '.claude', '.craft-x.tmp');
  writeFileSync(tmpPath, '---\ncontext: docs/missing.md\n---\n');

  const result = sut(tmpPath);

  assert.equal(result.exitCode, 2, `errors: ${JSON.stringify(result.errors)}`);
  assert.ok(Array.isArray(result.errors) && result.errors.length > 0, `errors: ${JSON.stringify(result.errors)}`);
  assert.ok(result.errors.every((line) => line.trim().length > 0), `every reported line must be non-blank: ${JSON.stringify(result.errors)}`);
  assert.ok(
    result.errors.some((line) => line.includes('context references missing file: docs/missing.md')),
    `errors must surface the real lint diagnostic verbatim: ${JSON.stringify(result.errors)}`
  );
  rmSync(dir, { recursive: true, force: true });
});
