/**
 * In-process unit tests for init-config main() — covers all Stryker no-coverage mutants.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 * The subprocess bin tests in init-config.bin.test.js prove end-to-end wiring;
 * these tests give Stryker in-process coverage of every branch.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/init-config-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

// ─── missing name argument → EXIT_ERR + stderr diagnostic ────────────────────

test('Given no name argument, when main runs, then returns 1 and stderr mentions name argument required', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io);

  assert.equal(result, 1, 'must return 1 when name is missing');
  assert.ok(io.stderr.joined().includes('name argument required'), `stderr was: ${io.stderr.joined()}`);
});

test('Given no name argument, when main runs, then the diagnostic names init-config', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io);

  assert.equal(result, 1);
  assert.ok(io.stderr.joined().includes('init-config'), `stderr was: ${io.stderr.joined()}`);
});

test('Given no name argument, when main runs, then stdout is empty', () => {
  const sut = main;
  const io = makeCaptureIo();

  sut([], io);

  assert.equal(io.stdout.joined(), '', 'stdout must be silent on error');
});

// ─── invalid name (traversal) → EXIT_ERR + stderr diagnostic ─────────────────

test('Given a traversal name "../escape", when main runs, then returns 1 and stderr contains error text', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['../escape'], io);

  assert.equal(result, 1, 'must return 1 for traversal name');
  assert.ok(io.stderr.joined().length > 0, 'must write a diagnostic to stderr');
});

test('Given an invalid name with uppercase "MyConfig", when main runs, then returns 1', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['MyConfig'], io);

  assert.equal(result, 1);
  assert.ok(io.stderr.joined().includes('init-config'), `stderr was: ${io.stderr.joined()}`);
});

test('Given an invalid name, when main runs, then the stderr diagnostic includes the rejected name', () => {
  const sut = main;
  const io = makeCaptureIo();

  sut(['My/Bad'], io);

  assert.ok(io.stderr.joined().includes('My/Bad'), `stderr must echo rejected name; got: ${io.stderr.joined()}`);
});

// ─── valid name → EXIT_OK + stdout printed path ───────────────────────────────

test('Given a valid kebab name "ci", when main runs, then returns 0', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['ci'], io);

  assert.equal(result, 0, `stderr was: ${io.stderr.joined()}`);
});

test('Given a valid kebab name "ci", when main runs, then stdout contains craft-ci.md', () => {
  const sut = main;
  const io = makeCaptureIo();

  sut(['ci'], io);

  assert.ok(io.stdout.joined().includes('craft-ci.md'), `stdout was: ${io.stdout.joined()}`);
});

test('Given a valid kebab name "my-config", when main runs, then stdout ends with a newline', () => {
  const sut = main;
  const io = makeCaptureIo();

  sut(['my-config'], io);

  assert.ok(io.stdout.joined().endsWith('\n'), 'stdout must end with a newline');
});

test('Given a valid kebab name, when main runs, then stderr is empty', () => {
  const sut = main;
  const io = makeCaptureIo();

  sut(['ci'], io);

  assert.equal(io.stderr.joined(), '', 'stderr must be empty on success');
});

test('Given a valid kebab name "ci", when main runs, then the printed path is relative (no leading slash)', () => {
  const sut = main;
  const io = makeCaptureIo();

  sut(['ci'], io);

  const printed = io.stdout.joined().trim();
  assert.ok(!printed.startsWith('/'), `path must be relative; got: ${printed}`);
});
