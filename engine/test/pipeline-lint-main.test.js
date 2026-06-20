/**
 * In-process unit tests for pipeline-lint-main — drives every branch (missing arg,
 * parse-throw, readFileSync-throw, validate-not-ok, success) so the glue lands in
 * Stryker's mutate scope. The retained child-process smoke is pipeline-lint.bin.test.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { main } from '../src/pipeline-lint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => join(__dir, 'fixtures', 'pipeline', name);
const DEFAULT_PIPELINE = join(__dir, '..', '..', 'pipeline', 'default.yml');

// ─── no path arg → 2 + usage ─────────────────────────────────────────────────

test('Given no path arg, when main runs, then it returns 2 and writes the usage line', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('Usage: pipeline-lint'), `stderr was: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── unparseable descriptor (parsePipeline throws) → 2 + "pipeline-lint:" ─────

test('Given a pipeline whose descriptor parse throws, when main runs, then it returns 2 with a pipeline-lint: message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([fixture('bad-archetype.yml')], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().startsWith('pipeline-lint:'), `stderr was: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── nonexistent file (readFileSync throws, same catch) → 2 + "pipeline-lint:" ─

test('Given a nonexistent pipeline path, when main runs, then it returns 2 with a pipeline-lint: message naming the error', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut(['/no/such/pipeline.yml'], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().startsWith('pipeline-lint:'), `stderr was: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── parses but graph invalid (validatePipeline not ok) → 2 + "  - " errors ──

test('Given a pipeline that parses but strands a consumer, when main runs, then it returns 2 and lists each error as a "  - " line', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([fixture('cycle.yml')], io);

  assert.equal(result, 2);
  assert.ok(io.stderr.joined().includes('  - '), `stderr was: ${io.stderr.joined()}`);
  assert.ok(io.stderr.joined().includes('beta'), `stderr should name the stranded artifact; got: ${io.stderr.joined()}`);
  assert.equal(io.stdout.joined(), '');
});

// ─── valid default pipeline → 0, no output ───────────────────────────────────

test('Given the real default pipeline, when main runs, then it returns 0 with no stderr', () => {
  const sut = main;
  const io = makeCaptureIo();

  const result = sut([DEFAULT_PIPELINE], io);

  assert.equal(result, 0, `stderr: ${io.stderr.joined()}`);
  assert.equal(io.stderr.joined(), '');
});
