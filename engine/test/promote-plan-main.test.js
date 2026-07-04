/**
 * In-process unit tests for promote-plan-main: argv/flag parsing, the
 * three-line stdout contract on success, and refusal/missing-name diagnostics.
 * Injected deps stand in for $HOME/the filesystem/containment so these tests
 * never touch a real $HOME (see promote-plan.bin.test.js for the real-filesystem
 * smoke coverage). Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { main } from '../src/promote-plan-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const FAKE_HOME = '/fake/home/user';

function identityContain(_root, target) {
  return target;
}

function localPath(name) {
  return join(resolve(process.cwd()), '.claude', `craft-${name}.md`);
}

function userPath(name) {
  return join(FAKE_HOME, '.claude', `craft-${name}.md`);
}

function baseDeps(overrides = {}) {
  return {
    homeDir: () => FAKE_HOME,
    fileExists: () => false,
    containByRealpath: identityContain,
    ...overrides,
  };
}

// ─── ok path: three-line stdout contract ─────────────────────────────────────

test('Given a present local source and an absent user destination, when main runs, then stdout carries source/dest/scope lines and exit is 0', () => {
  const sut = main;
  const io = makeCaptureIo();
  const deps = baseDeps({ fileExists: (p) => p === localPath('ci') });

  const result = sut(['ci'], io, deps);

  const expected = `source=${localPath('ci')}\ndest=${userPath('ci')}\nscope=user\n`;
  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), expected);
});

test('Given --demote with a present user source, when main runs, then scope=local in the stdout contract', () => {
  const sut = main;
  const io = makeCaptureIo();
  const deps = baseDeps({ fileExists: (p) => p === userPath('yy') });

  const result = sut(['yy', '--demote'], io, deps);

  const expected = `source=${userPath('yy')}\ndest=${localPath('yy')}\nscope=local\n`;
  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), expected);
});

test('Given --force with an existing destination, when main runs, then it returns 0 and reports the overwrite plan', () => {
  const sut = main;
  const io = makeCaptureIo();
  const deps = baseDeps({ fileExists: (p) => p === localPath('zz') || p === userPath('zz') });

  const result = sut(['zz', '--force'], io, deps);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.ok(io.stdout.joined().includes('scope=user'), `stdout: ${io.stdout.joined()}`);
});

// ─── refusal path ─────────────────────────────────────────────────────────────

test('Given no source config, when main runs, then it returns non-zero and stderr carries the refusal diagnostic', () => {
  const sut = main;
  const io = makeCaptureIo();
  const deps = baseDeps({ fileExists: () => false });

  const result = sut(['missing'], io, deps);

  assert.notEqual(result, 0);
  assert.ok(io.stderr.joined().includes('no local-scope config missing to promote'), `stderr: ${io.stderr.joined()}`);
});

test('Given a present destination without --force, when main runs, then it returns non-zero and stderr surfaces the destination-exists refusal', () => {
  const sut = main;
  const io = makeCaptureIo();
  const deps = baseDeps({ fileExists: (p) => p === localPath('ww') || p === userPath('ww') });

  const result = sut(['ww'], io, deps);

  assert.notEqual(result, 0);
  assert.ok(io.stderr.joined().includes('destination craft-ww.md exists at user scope'), `stderr: ${io.stderr.joined()}`);
});

// ─── missing name ─────────────────────────────────────────────────────────────

test('Given no argv, when main runs, then it returns non-zero with a stderr diagnostic', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io, baseDeps());

  assert.notEqual(result, 0);
  assert.ok(io.stderr.joined().trim().length > 0, 'expected a diagnostic on stderr');
});
