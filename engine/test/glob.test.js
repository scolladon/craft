import { test } from 'node:test';
import assert from 'node:assert/strict';

import { matchGlob, globsOverlap } from '../src/glob.js';

test('Given a path and a single-segment `*` pattern that match, when matchGlob runs, then it returns true', () => {
  const sut = matchGlob;
  const path = 'engine/src/observability/memory.js';
  const pattern = 'engine/src/observability/*';

  const result = sut(path, pattern);

  assert.equal(result, true);
});

test('Given a path nested deeper than a single-segment `*` pattern, when matchGlob runs, then it returns false (`*` does not cross `/`)', () => {
  const sut = matchGlob;
  const path = 'engine/src/observability/adapters/claude/telemetry.js';
  const pattern = 'engine/src/observability/*';

  const result = sut(path, pattern);

  assert.equal(result, false);
});

test('Given the same deeply-nested path against a `**` pattern, when matchGlob runs, then it returns true (`**` crosses segments)', () => {
  const sut = matchGlob;
  const path = 'engine/src/observability/adapters/claude/telemetry.js';
  const pattern = 'engine/src/observability/**';

  const result = sut(path, pattern);

  assert.equal(result, true);
});

test('Given a path and an extension-scoped `*.md` pattern that match, when matchGlob runs, then it returns true', () => {
  const sut = matchGlob;
  const path = 'docs/adapters/telemetry.md';
  const pattern = 'docs/adapters/*.md';

  const result = sut(path, pattern);

  assert.equal(result, true);
});

test('Given a path outside the pattern\'s subtree, when matchGlob runs, then it returns false', () => {
  const sut = matchGlob;
  const path = 'engine/src/dod.js';
  const pattern = 'engine/src/observability/**';

  const result = sut(path, pattern);

  assert.equal(result, false);
});

test('Given an input that would make the underlying matcher throw, when matchGlob runs, then it returns false instead of throwing', () => {
  const sut = matchGlob;

  const result = sut(null, '*');

  assert.equal(result, false);
});

test('Given two identical concrete globs with no wildcard and no trailing slash, when globsOverlap runs, then it returns true', () => {
  const sut = globsOverlap;
  const a = 'engine/src/glob.js';
  const b = 'engine/src/glob.js';

  const result = sut(a, b);

  assert.equal(result, true);
});

test('Given a literal prefix that only matches partway into a sibling name, when globsOverlap runs, then it returns false (a `/` boundary is required)', () => {
  const sut = globsOverlap;
  const a = 'engine/src/foobar';
  const b = 'engine/src/foo';

  const result = sut(a, b);

  assert.equal(result, false);
});

test('Given a concrete file path and its literal parent-directory prefix (no wildcard, no trailing slash), when globsOverlap runs, then it returns true', () => {
  const sut = globsOverlap;
  const a = 'engine/src/glob.js';
  const b = 'engine/src';

  const result = sut(a, b);

  assert.equal(result, true);
});
