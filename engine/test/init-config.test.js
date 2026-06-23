/**
 * Pure unit tests for resolveConfigPath.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { resolveConfigPath } from '../src/init-config.js';

const REPO_ROOT = '/repo';

// ─── valid kebab name → ok:true, path ends .claude/craft-<name>.md ───────────

test('Given kebab-case name "ci", when resolveConfigPath runs, then ok:true and path ends .claude/craft-ci.md', () => {
  const sut = resolveConfigPath;

  const result = sut(REPO_ROOT, 'ci');

  assert.equal(result.ok, true);
  assert.ok(result.path.endsWith('.claude/craft-ci.md'), `path was: ${result.path}`);
});

// ─── name with slash → ok:false ──────────────────────────────────────────────

test('Given name slash "a/b", when resolveConfigPath runs, then ok:false with path-separator error', () => {
  const sut = resolveConfigPath;

  const result = sut(REPO_ROOT, 'a/b');

  assert.equal(result.ok, false);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
});

// ─── traversal name "../escape" → ok:false (rejected by the kebab pattern) ────

test('Given traversal name "../escape", when resolveConfigPath runs, then ok:false (rejected by the kebab pattern)', () => {
  const sut = resolveConfigPath;

  const result = sut(REPO_ROOT, '../escape');

  assert.equal(result.ok, false);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
});

// ─── UpperCase name → ok:false ────────────────────────────────────────────────

test('Given UpperCase name "MyConfig", when resolveConfigPath runs, then ok:false (kebab-case only)', () => {
  const sut = resolveConfigPath;

  const result = sut(REPO_ROOT, 'MyConfig');

  assert.equal(result.ok, false);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
});

// ─── empty name → ok:false ───────────────────────────────────────────────────

test('Given an empty name, when resolveConfigPath runs, then ok:false', () => {
  const sut = resolveConfigPath;

  const result = sut(REPO_ROOT, '');

  assert.equal(result.ok, false);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
});

// ─── backslash name → ok:false ───────────────────────────────────────────────

test('Given name with backslash "a\\\\b", when resolveConfigPath runs, then ok:false', () => {
  const sut = resolveConfigPath;

  const result = sut(REPO_ROOT, 'a\\b');

  assert.equal(result.ok, false);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
});

// ─── valid name → resolved path contained under repoRoot/.claude ─────────────

test('Given valid name, when resolveConfigPath runs, then resolved path is contained under repoRoot/.claude', () => {
  const sut = resolveConfigPath;
  const expected = join(REPO_ROOT, '.claude');

  const result = sut(REPO_ROOT, 'my-config');

  assert.equal(result.ok, true);
  assert.ok(result.path.startsWith(expected), `path was: ${result.path}`);
});

// ─── dot-segment name "a..b" → ok:false ──────────────────────────────────────

test('Given name dot segment "a..b", when resolveConfigPath runs, then ok:false', () => {
  const sut = resolveConfigPath;

  const result = sut(REPO_ROOT, 'a..b');

  assert.equal(result.ok, false);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
});
