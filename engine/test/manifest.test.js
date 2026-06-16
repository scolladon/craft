/**
 * Unit tests for validateManifest — pure manifest shape validator.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from '../src/manifest.js';

const ALWAYS_EXISTS = () => true;
const NEVER_EXISTS  = () => false;

// ─── null / undefined / empty ────────────────────────────────────────────────

test('Given a null manifest, when validateManifest runs, then it returns ok with no errors', () => {
  const sut = validateManifest;

  const result = sut(null, { fileExists: ALWAYS_EXISTS });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given an undefined manifest, when validateManifest runs, then it returns ok with no errors', () => {
  const sut = validateManifest;

  const result = sut(undefined, { fileExists: ALWAYS_EXISTS });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given an empty object manifest, when validateManifest runs, then it returns ok with no errors', () => {
  const sut = validateManifest;

  const result = sut({}, { fileExists: ALWAYS_EXISTS });

  assert.deepEqual(result, { ok: true, errors: [] });
});

// ─── top-level key validation ────────────────────────────────────────────────

test('Given a manifest with an unknown top-level key, when validateManifest runs, then it returns an error containing "unknown top-level key"', () => {
  const sut = validateManifest;

  const result = sut({ unknownKey: 'value' }, { fileExists: ALWAYS_EXISTS });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown top-level key: unknownKey')));
});

test('Given a manifest with all known top-level keys, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;
  const manifest = {
    backlog: 'my-backlog',
    paths: { repo: '.' },
    context: null,
    gates: {},
    phases: {},
    pr: {},
    scripts: {},
    models: {},
    pipeline: {},
    retrieval: {},
    execution: 'inline',
  };

  const result = sut(manifest, { fileExists: ALWAYS_EXISTS });

  assert.equal(result.ok, true);
});

// ─── pipeline sub-key validation ─────────────────────────────────────────────

test('Given a manifest with pipeline.skip array, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { skip: ['decisions'] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with pipeline.skip and pipeline.profile, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { skip: ['decisions'], profile: 'solo' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with pipeline.insert, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { insert: [] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with an unknown pipeline sub-key, when validateManifest runs, then it returns an error containing "unknown pipeline key"', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { bogus: true } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown pipeline key: bogus')));
});

// ─── retrieval and execution (shape-only) ────────────────────────────────────

test('Given a manifest with retrieval as empty object, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut({ retrieval: {} }, { fileExists: ALWAYS_EXISTS });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with execution as a scalar, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut({ execution: 'inline' }, { fileExists: ALWAYS_EXISTS });

  assert.deepEqual(result, { ok: true, errors: [] });
});

// ─── models key validation ───────────────────────────────────────────────────

test('Given a manifest with an unknown models key, when validateManifest runs, then it returns an error containing "unknown models key"', () => {
  const sut = validateManifest;

  const result = sut(
    { models: { bogusAgent: 'claude-3' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown models key: bogusAgent')));
});

test('Given a manifest with a known models key (fallback), when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { models: { fallback: 'claude-3-haiku' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

// ─── gates field validation ──────────────────────────────────────────────────

test('Given a manifest with an unknown gates field, when validateManifest runs, then it returns an error containing "unknown gates field"', () => {
  const sut = validateManifest;

  const result = sut(
    { gates: { bogusField: 'value' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown gates field: bogusField')));
});

test('Given a manifest with known gates fields, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { gates: { slice: 'npm test', phase: 'npm run ci', 'review-batch': 'npm run review' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

// ─── pr field validation ─────────────────────────────────────────────────────

test('Given a manifest with an unknown pr field, when validateManifest runs, then it returns an error containing "unknown pr field"', () => {
  const sut = validateManifest;

  const result = sut(
    { pr: { bogusField: 'value' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown pr field: bogusField')));
});

test('Given a manifest with known pr fields, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { pr: { creator: 'gh', 'pre-pr-gate': 'npm test' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

// ─── scripts field validation ─────────────────────────────────────────────────

test('Given a manifest with an unknown scripts field, when validateManifest runs, then it returns an error containing "unknown scripts field"', () => {
  const sut = validateManifest;

  const result = sut(
    { scripts: { bogusScript: 'path/to/script.sh' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown scripts field: bogusScript')));
});

test('Given a manifest with a known scripts field pointing to an existing file, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { scripts: { 'post-setup': 'scripts/setup.sh' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with a scripts field pointing to a missing file, when validateManifest runs, then it returns an error containing "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { scripts: { 'post-setup': 'scripts/missing.sh' } },
    { fileExists: NEVER_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')));
});

test('Given a manifest with a scripts field as an array of file paths, when validateManifest runs and one is missing, then it returns an error containing "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { scripts: { 'post-setup': ['scripts/a.sh', 'scripts/missing.sh'] } },
    { fileExists: p => p === 'scripts/a.sh' },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')));
});

// ─── phase validation ────────────────────────────────────────────────────────

test('Given a manifest with an unknown phase name, when validateManifest runs, then it returns an error containing "unknown phase"', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { bogusPhase: {} } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown phase: bogusPhase')));
});

test('Given a manifest with a known phase and a known field, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { strategy: 'sequential' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with an unknown field on a known phase, when validateManifest runs, then it returns an error containing "unknown field on phase"', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { bogusField: 'value' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown field on phase plan: bogusField')));
});

// ─── ADR-011: per-phase skip → loud error ────────────────────────────────────

test('Given a manifest with phases.plan.skip present, when validateManifest runs, then it returns an error containing "pipeline.skip"', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { skip: true } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('pipeline.skip')));
});

test('Given a manifest with phases.implement.skip set to false, when validateManifest runs, then it returns an error containing "pipeline.skip"', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { implement: { skip: false } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('pipeline.skip')));
});

// ─── phase context/override file-ref validation ──────────────────────────────

test('Given a manifest with phases.plan.context pointing to a missing file, when validateManifest runs, then it returns an error containing "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { context: 'missing/file.md' } } },
    { fileExists: NEVER_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')));
});

test('Given a manifest with phases.plan.context as an array with a missing file, when validateManifest runs, then it returns an error containing "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { context: ['existing.md', 'missing.md'] } } },
    { fileExists: p => p === 'existing.md' },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')));
});

test('Given a manifest with phases.plan.override pointing to a missing file, when validateManifest runs, then it returns an error containing "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { override: 'missing/override.md' } } },
    { fileExists: NEVER_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')));
});

test('Given a manifest with phases.plan.context as null, when validateManifest runs, then it returns ok (null path is valid)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { context: null } } },
    { fileExists: NEVER_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with phases.plan.context as empty string, when validateManifest runs, then it returns ok (empty path is valid)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { context: '' } } },
    { fileExists: NEVER_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with phases.plan.context as tilde string, when validateManifest runs, then it returns ok (tilde path is valid)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { context: '~' } } },
    { fileExists: NEVER_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

// ─── top-level context file-ref validation ───────────────────────────────────

test('Given a manifest with a top-level context scalar pointing to a missing file, when validateManifest runs, then it returns an error containing "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { context: 'missing/context.md' },
    { fileExists: NEVER_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')));
});

test('Given a manifest with a top-level context as an array with a missing file, when validateManifest runs, then it returns an error containing "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { context: ['existing.md', 'missing.md'] },
    { fileExists: p => p === 'existing.md' },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')));
});

test('Given a manifest with a top-level context as null, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut({ context: null }, { fileExists: NEVER_EXISTS });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with a top-level context as tilde string, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut({ context: '~' }, { fileExists: NEVER_EXISTS });

  assert.deepEqual(result, { ok: true, errors: [] });
});

// ─── error accumulation ──────────────────────────────────────────────────────

test('Given a manifest with multiple validation errors, when validateManifest runs, then all errors accumulate and ok is false', () => {
  const sut = validateManifest;

  const result = sut(
    {
      unknownTop: 'x',
      phases: { bogusPhase: { skip: true } },
      gates: { bogusGateField: 'y' },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 3);
  assert.ok(result.errors.some(e => e.includes('unknown top-level key: unknownTop')));
  assert.ok(result.errors.some(e => e.includes('unknown phase: bogusPhase')));
  assert.ok(result.errors.some(e => e.includes('unknown gates field: bogusGateField')));
});
