/**
 * In-process unit tests for the pure promote-plan decision computer: direction
 * (promote/demote), source-existence, destination-exists refuse/force, and
 * $HOME-containment. Injected deps (fake fileExists presence-map, fixed fake
 * homeDir/repoRoot, identity/null containByRealpath) so these tests never touch
 * a real filesystem or $HOME.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { planPromote } from '../src/promote-plan.js';

const REPO_ROOT = '/repo';
const HOME = '/home/user';

function identityContain(_root, target) {
  return target;
}

function nullContain() {
  return null;
}

function localPath(name) {
  return join(REPO_ROOT, '.claude', `craft-${name}.md`);
}

function userPath(name) {
  return join(HOME, '.claude', `craft-${name}.md`);
}

function baseDeps(overrides = {}) {
  return {
    repoRoot: REPO_ROOT,
    homeDir: HOME,
    fileExists: () => false,
    containByRealpath: identityContain,
    ...overrides,
  };
}

// ─── promote (default direction: local → user) ───────────────────────────────

test('Given a present local source and an absent user destination, when planPromote runs, then it returns ok with the local→user paths and overwrote false', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: (p) => p === localPath('ci') });

  const result = sut({ name: 'ci' }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.sourcePath, localPath('ci'));
  assert.equal(result.destPath, userPath('ci'));
  assert.equal(result.fromScope, 'local');
  assert.equal(result.toScope, 'user');
  assert.equal(result.destScope, 'user');
  assert.equal(result.overwrote, false);
});

test('Given an absent local source, when planPromote runs, then it refuses naming the local scope', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: () => false });

  const result = sut({ name: 'ci' }, deps);

  assert.equal(result.ok, false);
  assert.ok(result.error.includes('no local-scope config ci to promote'), `error was: ${result.error}`);
});

test('Given a present user destination and no --force, when planPromote runs, then it refuses naming the user scope', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: (p) => p === localPath('ci') || p === userPath('ci') });

  const result = sut({ name: 'ci' }, deps);

  assert.equal(result.ok, false);
  assert.ok(result.error.includes('destination craft-ci.md exists at user scope'), `error was: ${result.error}`);
  assert.ok(result.error.includes('--force'), `error was: ${result.error}`);
});

test('Given a present user destination and --force, when planPromote runs, then it returns ok with overwrote true', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: (p) => p === localPath('ci') || p === userPath('ci') });

  const result = sut({ name: 'ci', force: true }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.overwrote, true);
});

test('Given a containment-null user destination, when planPromote runs, then it refuses with a containment error', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: (p) => p === localPath('ci'), containByRealpath: nullContain });

  const result = sut({ name: 'ci' }, deps);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'user-scope path failed containment');
});

// ─── demote (user → local) ────────────────────────────────────────────────────

test('Given a present user source and an absent local destination, when planPromote runs with demote, then it returns ok with the user→local paths', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: (p) => p === userPath('ci') });

  const result = sut({ name: 'ci', demote: true }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.sourcePath, userPath('ci'));
  assert.equal(result.destPath, localPath('ci'));
  assert.equal(result.fromScope, 'user');
  assert.equal(result.toScope, 'local');
  assert.equal(result.destScope, 'local');
  assert.equal(result.overwrote, false);
});

test('Given an absent user source, when planPromote runs with demote, then it refuses naming the user scope', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: () => false });

  const result = sut({ name: 'ci', demote: true }, deps);

  assert.equal(result.ok, false);
  assert.ok(result.error.includes('no user-scope config ci to demote'), `error was: ${result.error}`);
});

test('Given a present local destination and no --force, when planPromote runs with demote, then it refuses naming the local scope', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: (p) => p === userPath('ci') || p === localPath('ci') });

  const result = sut({ name: 'ci', demote: true }, deps);

  assert.equal(result.ok, false);
  assert.ok(result.error.includes('destination craft-ci.md exists at local scope'), `error was: ${result.error}`);
});

test('Given a present local destination and --force, when planPromote runs with demote, then it returns ok with overwrote true', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: (p) => p === userPath('ci') || p === localPath('ci') });

  const result = sut({ name: 'ci', demote: true, force: true }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.overwrote, true);
});

test('Given a containment-null user source, when planPromote runs with demote, then it refuses with a containment error before checking existence', () => {
  const sut = planPromote;
  const deps = baseDeps({ fileExists: () => false, containByRealpath: nullContain });

  const result = sut({ name: 'ci', demote: true }, deps);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'user-scope path failed containment');
});

// ─── name validation ──────────────────────────────────────────────────────────

test('Given an empty name, when planPromote runs, then it refuses', () => {
  const sut = planPromote;
  const deps = baseDeps();

  const result = sut({ name: '' }, deps);

  assert.equal(result.ok, false);
});

test('Given a name with an uppercase segment, when planPromote runs, then it refuses', () => {
  const sut = planPromote;
  const deps = baseDeps();

  const result = sut({ name: 'BadName' }, deps);

  assert.equal(result.ok, false);
});
