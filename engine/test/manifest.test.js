/**
 * Unit tests for validateManifest — pure manifest shape validator.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, registeredBacklogNames } from '../src/manifest.js';

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
    backlog: { source: 'file', ref: null },
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

test('Given pipeline.reorder: [validation, review] in manifest, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { reorder: ['validation', 'review'] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given pipeline.reorder: "not-a-list" in manifest, when validateManifest runs, then ok:false with shape error', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { reorder: 'not-a-list' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('pipeline.reorder must be a list of phase ids')));
});

test('Given pipeline.reorder: null in manifest (empty key body), when validateManifest runs, then ok:false with shape error', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { reorder: null } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('pipeline.reorder must be a list of phase ids')));
});

test('Given pipeline.reorder: [1, 2] in manifest (non-string items), when validateManifest runs, then ok:false with an error per bad item', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { reorder: [1, 2] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('pipeline.reorder[0]') && e.includes('number')));
  assert.ok(result.errors.some(e => e.includes('pipeline.reorder[1]') && e.includes('number')));
});

test('Given pipeline.reorder: [valid, 42, valid] in manifest (mixed), when validateManifest runs, then only the non-string item errors', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { reorder: ['validation', 42, 'review'] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('pipeline.reorder[1]') && e.includes('number')));
  assert.ok(!result.errors.some(e => e.includes('pipeline.reorder[0]')));
  assert.ok(!result.errors.some(e => e.includes('pipeline.reorder[2]')));
});

test('Given pipeline.reorder: [] in manifest (empty list), when validateManifest runs, then ok:true (empty is valid shape)', () => {
  const sut = validateManifest;

  const result = sut(
    { pipeline: { reorder: [] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
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
  assert.ok(result.errors.length >= 4);
  assert.ok(result.errors.some(e => e.includes('unknown top-level key: unknownTop')));
  assert.ok(result.errors.some(e => e.includes('unknown phase: bogusPhase')));
  assert.ok(result.errors.some(e => e.includes('unknown gates field: bogusGateField')));
  // the per-phase skip on bogusPhase must also accumulate (ADR-011), not be dropped
  assert.ok(result.errors.some(e => e.includes('pipeline.skip')));
});

// ─── review fixes: faithful-port coverage the slice-2 bats fixtures depend on ──

test('Given a missing opts argument, when validateManifest runs on a path-bearing manifest, then it does not throw (never-throws contract)', () => {
  const sut = validateManifest;

  // No opts passed at all — fileExists must default safely, not throw.
  const result = sut({ context: 'some/path.md' });

  assert.equal(result.ok, true);
});

test('Given a scripts field as an array of all-existing files, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { scripts: { 'post-setup': ['scripts/a.sh', 'scripts/b.sh'] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given phases.review.context as an array of all-existing files, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { context: ['a.md', 'b.md'] } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given phases.plan.override as an array with a missing file, when validateManifest runs, then it returns an error containing "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { override: ['ok.md', 'gone.md'] } } },
    { fileExists: p => p === 'ok.md' },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')));
});

test('Given phases.plan.override as an array of all-existing files, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { override: ['a.md', 'b.md'] } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given phases.plan.override as null, when validateManifest runs, then it returns ok (null path is valid)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { plan: { override: null } } },
    { fileExists: NEVER_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a known phase with non-blocking-jobs and merge-flags fields, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { docs: { 'non-blocking-jobs': 2 }, merge: { 'merge-flags': '--squash' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a non-fallback models key (slice-implementer), when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { models: { 'slice-implementer': 'haiku', reviewer: 'sonnet' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a per-phase skip on a NON-protected phase (design), when validateManifest runs, then it is still rejected with pipeline.skip guidance (ADR-011 broadening)', () => {
  const sut = validateManifest;

  // Pre-P3 the bash PROTECTED list let design.skip lint clean; ADR-011 rejects every per-phase skip.
  const result = sut(
    { phases: { design: { skip: true } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('pipeline.skip')));
});

// ─── canonical phase names (new concern vocabulary) ──────────────────────────

test('Given a manifest with new canonical phase names, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { workspace: {}, validation: {}, documentation: {} } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with old phase names (aliases), when validateManifest runs, then it returns ok (back-compat via resolveAlias)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { branch: {}, mutation: {}, docs: {} } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest naming the prd alias (target is a default-off phase), when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  // prd→requirements is the one alias whose target shape differs from the rename pattern
  // and whose phase is default-off; pin it through the manifest path, not just resolveAlias.
  const result = sut(
    { phases: { prd: {} } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest mixing an old alias and a new canonical phase name, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { branch: {}, implementation: {} } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

// ─── validation-triager models key (renamed from mutation-triager) ────────────

test('Given a manifest with models.validation-triager, when validateManifest runs, then it returns ok', () => {
  const sut = validateManifest;

  const result = sut(
    { models: { 'validation-triager': 'sonnet' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given a manifest with models.mutation-triager (renamed key), when validateManifest runs, then it returns an error containing "validation-triager"', () => {
  const sut = validateManifest;

  const result = sut(
    { models: { 'mutation-triager': 'sonnet' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('validation-triager')));
});

// ─── phases: newly accepted fields (ADR-028 lint-gap closure) ────────────────

test('Given phases.documentation.execution: inline, when validateManifest runs, then ok:true (no longer rejected)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { documentation: { execution: 'inline' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.planning.role: "my:domain-planner", when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { planning: { role: 'my:domain-planner' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { max_cycles: 2 }, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { max_cycles: 2 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.requirements.enabled: true, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { requirements: { enabled: true } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.role: 42 (non-string), when validateManifest runs, then ok:false with role-type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { role: 42 } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.review.role') && e.includes('string')));
});

test('Given phases.review.model: true (non-string), when validateManifest runs, then ok:false with model-type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { model: true } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.review.model') && e.includes('string')));
});

test('Given phases.planning.procedure: "acme:my-planner", when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { planning: { procedure: 'acme:my-planner' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.planning.procedure: 42 (non-string), when validateManifest runs, then ok:false with procedure-type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { planning: { procedure: 42 } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.planning.procedure') && e.includes('string')));
});

test('Given phases.review.enabled: "yes" (non-boolean), when validateManifest runs, then ok:false with enabled-type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { enabled: 'yes' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.review.enabled') && e.includes('boolean')));
});

// ─── phases.harness shape validation (ADR-030) ───────────────────────────────

test('Given phases.review.harness: "not-an-object", when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: 'not-an-object' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('phases.review.harness') && e.includes('object')));
});

test('Given phases.review.harness: { max_cycles: "three" }, when validateManifest runs, then ok:false with max_cycles type error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { max_cycles: 'three' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('max_cycles') && e.includes('integer')));
});

test('Given phases.review.harness: { passes: 0 }, when validateManifest runs, then ok:false (passes must be positive)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { passes: 0 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('passes') && e.includes('positive')));
});

test('Given phases.review.harness: { convergence: "bad-value" }, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: 'bad-value' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('convergence') && e.includes('non-negative')));
});

test('Given phases.review.harness: { convergence: 0 }, when validateManifest runs, then ok:true (numeric 0 is valid)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: 0 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { convergence: "low-only" }, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: 'low-only' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { convergence: "none" }, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: 'none' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { dimensions: "not-a-list" }, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { dimensions: 'not-a-list' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('dimensions') && e.includes('list of strings')));
});

test('Given phases.review.harness: { dimensions: ["code", "tests"] }, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { dimensions: ['code', 'tests'] } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { tool: 42 }, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { tool: 42 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('tool') && e.includes('string')));
});

test('Given phases.review.harness: { incremental: "yes" }, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { incremental: 'yes' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('incremental') && e.includes('boolean')));
});

test('Given phases.review.harness: { rules: ".dependency-cruiser.json" } (unknown sub-key), when validateManifest runs, then ok:true (forward-compat)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { rules: '.dependency-cruiser.json' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

// ─── phases.harness boundary cases (mutation-resistance) ─────────────────────

test('Given phases.review.harness: null, when validateManifest runs, then ok:false (null is not an object)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: null } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('harness') && e.includes('object')));
});

test('Given phases.review.harness: [] (array), when validateManifest runs, then ok:false (array is not an object)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: [] } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('harness') && e.includes('object')));
});

test('Given phases.review.harness: { passes: 1 }, when validateManifest runs, then ok:true (minimal valid passes)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { passes: 1 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { passes: 1.5 } (float), when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { passes: 1.5 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('passes') && e.includes('integer')));
});

test('Given phases.review.harness: { max_cycles: 0 }, when validateManifest runs, then ok:false (zero is not positive)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { max_cycles: 0 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('max_cycles') && e.includes('integer')));
});

// ─── ADV-3: empty procedure boundary ─────────────────────────────────────────

test('ADV-3 Given phases.planning.procedure: "" (empty string), when validateManifest runs, then ok:false with procedure error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { planning: { procedure: '' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('phases.planning.procedure') && e.includes('string')),
    `errors must name the field; got: ${JSON.stringify(result.errors)}`,
  );
});

test('ADV-3 Given phases.planning.procedure: "   " (whitespace-only), when validateManifest runs, then ok:false with procedure error', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { planning: { procedure: '   ' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('phases.planning.procedure') && e.includes('string')),
    `errors must name the field; got: ${JSON.stringify(result.errors)}`,
  );
});

test('Given phases.review.harness: { convergence: -1 } (negative), when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: -1 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('convergence') && e.includes('non-negative')));
});

test('Given phases.review.harness: { convergence: Infinity }, when validateManifest runs, then ok:false (must be finite)', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { convergence: Infinity } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('convergence') && e.includes('non-negative')));
});

test('Given phases.review.harness: { dimensions: [] } (empty list), when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { dimensions: [] } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.review.harness: { dimensions: [42] } (non-string element), when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { harness: { dimensions: [42] } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('dimensions') && e.includes('list of strings')));
});

test('Given phases.validation.harness: { scope: "per-file" }, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { validation: { harness: { scope: 'per-file' } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given phases.validation.harness: { scope: 42 } (non-string), when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { validation: { harness: { scope: 42 } } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('scope') && e.includes('string')));
});

test('Given phases.review.model: "sonnet" (valid string), when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { phases: { review: { model: 'sonnet' } } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

// ─── backlog source/shape validation ─────────────────────────────────────────

test('Given backlog { source: file, ref: existing } when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'file', ref: 'some/file.md' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given backlog { source: custom, ref: non-empty } when validateManifest runs with NEVER_EXISTS, then ok:true and no "references missing file" error', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'custom', ref: './scripts/backlog.sh' } },
    { fileExists: NEVER_EXISTS },
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test('Given backlog as a bare string when validateManifest runs, then error contains "backlog must be an object"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: 'my-backlog' },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('backlog must be an object')));
});

test('Given backlog as an array when validateManifest runs, then error contains "backlog must be an object"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: ['file', 'custom'] },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('backlog must be an object')));
});

test('Given backlog { source: bogus, ref: x } when validateManifest runs, then error contains "unknown backlog source"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'bogus', ref: 'x' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown backlog source')));
});

test('Given backlog { source: linear, ref: x } when validateManifest runs, then error contains "use source: custom" and does not contain "unknown backlog source"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'linear', ref: 'x' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes("'linear'") && e.includes('use source: custom')));
  assert.ok(!result.errors.some(e => e.includes('unknown backlog source')));
});

test('Given backlog { source: github-issues, ref: x } when validateManifest runs, then error contains "use source: custom" and does not contain "unknown backlog source"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'github-issues', ref: 'x' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('use source: custom')));
  assert.ok(!result.errors.some(e => e.includes('unknown backlog source')));
});

test('Given backlog { source: jira, ref: x } when validateManifest runs, then error contains "use source: custom" and does not contain "unknown backlog source"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'jira', ref: 'x' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('use source: custom')));
  assert.ok(!result.errors.some(e => e.includes('unknown backlog source')));
});

test('Given backlog { source: file, ref: missing } when validateManifest runs with NEVER_EXISTS, then error contains "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'file', ref: 'manifest/stubs/nope.md' } },
    { fileExists: NEVER_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')));
  assert.ok(result.errors.some(e => e.includes('backlog.ref')));
});

test('Given backlog null when validateManifest runs, then ok is false and error contains "backlog must be an object"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: null },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('backlog must be an object')));
});

test('Given backlog { source: custom } with no ref when validateManifest runs, then error contains "ref is required"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'custom' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('ref is required')));
});

test('Given backlog with an unknown sub-key when validateManifest runs, then error contains "unknown backlog field"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'file', ref: 'manifest/stubs/a.md', bogus: 1 } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown backlog field')));
});

test('Given backlog { source: bogus } when validateManifest runs, then errors has length exactly 1', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'bogus' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
});

test('Given backlog { ref } with no source when validateManifest runs, then error contains "must declare a source"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { ref: 'manifest/stubs/a.md' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('must declare a source')));
});

test('Given backlog { source: custom, ref: null } when validateManifest runs, then error contains "ref is required"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'custom', ref: null } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('ref is required')));
});

test('Given backlog { source: custom, ref: empty string } when validateManifest runs, then error contains "ref is required"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'custom', ref: '' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('ref is required')));
});

test('Given backlog { source: custom, ref: whitespace } when validateManifest runs, then error contains "ref is required"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'custom', ref: '   ' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('ref is required')));
});

test('Given backlog { source: custom, ref: non-string } when validateManifest runs, then error contains "ref is required"', () => {
  const sut = validateManifest;

  const result = sut(
    { backlog: { source: 'custom', ref: 42 } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('ref is required')));
});

test('Given backlog { source: acme-tracker } with a matching extends.backlog-adapters registration, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    {
      backlog: { source: 'acme-tracker', ref: '.claude/workflow/acme-backlog.sh' },
      extends: {
        'backlog-adapters': [
          { name: 'acme-tracker', ref: '.claude/workflow/acme-backlog.sh' },
        ],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given backlog { source: ghost-tracker } with no matching extends.backlog-adapters registration, when validateManifest runs, then ok:false with "unknown backlog source"', () => {
  const sut = validateManifest;

  const result = sut(
    {
      backlog: { source: 'ghost-tracker', ref: '.claude/workflow/ghost-backlog.sh' },
      extends: {
        'backlog-adapters': [
          { name: 'acme-tracker', ref: '.claude/workflow/acme-backlog.sh' },
        ],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('unknown backlog source')));
});

// ─── extends block validation ─────────────────────────────────────────────────

test('Given a valid full extends block, when validateManifest runs, then ok:true', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        phases: [
          {
            id: 'bench',
            procedure: 'pluginB:bench',
            role: 'pluginB:bench-runner',
            archetype: 'harness',
            contract: ['harness-exec'],
            consumes: ['change'],
            produces: ['bench-report'],
            after: 'validation',
            gate: 'pluginB-bench --check',
          },
        ],
        agents: ['pluginB:bench-runner'],
        profiles: {
          audit: {
            setup: 'inline',
            specification: 'agent',
            construction: 'agent',
            harness: 'agent',
            refinement: 'agent',
            delivery: 'inline',
          },
        },
        'backlog-adapters': [{ name: 'acme-tracker', ref: '.claude/workflow/acme-backlog.sh' }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('Given extends with an unknown sub-key "bogus", when validateManifest runs, then error names "bogus"', () => {
  const sut = validateManifest;

  const result = sut(
    { extends: { bogus: 'x' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('bogus')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases with a phase whose contract includes an out-of-vocab bundle, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        phases: [
          { id: 'bench', procedure: 'pluginB:bench', archetype: 'harness', contract: ['my-bespoke-floor'] },
        ],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('my-bespoke-floor')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases with a phase whose contract is a scalar string (not array), when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        phases: [
          { id: 'bench', procedure: 'pluginB:bench', archetype: 'harness', contract: 'harness-exec' },
        ],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.toLowerCase().includes('contract')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases with a phase with an invalid archetype, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        phases: [
          { id: 'bench', procedure: 'pluginB:bench', archetype: 'bogus', contract: ['harness-exec'] },
        ],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('archetype')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases with a phase missing id, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        phases: [
          { procedure: 'pluginB:bench', archetype: 'harness', contract: [] },
        ],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('id')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases with a phase missing procedure, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        phases: [
          { id: 'bench', archetype: 'harness', contract: [] },
        ],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('procedure')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.agents with a non-string element, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { extends: { agents: [42] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('agents')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.profiles with a profile missing an archetype key, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        profiles: {
          audit: {
            setup: 'inline',
            specification: 'agent',
            construction: 'agent',
            // harness missing
            refinement: 'agent',
            delivery: 'inline',
          },
        },
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('harness')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.profiles with a profile value outside {inline,agent}, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        profiles: {
          audit: {
            setup: 'bogus',
            specification: 'agent',
            construction: 'agent',
            harness: 'agent',
            refinement: 'agent',
            delivery: 'inline',
          },
        },
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('bogus') || e.includes('inline|agent')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.backlog-adapters with an entry missing ref, when validateManifest runs, then ok:false', () => {
  const sut = validateManifest;

  const result = sut(
    { extends: { 'backlog-adapters': [{ name: 'acme-tracker' }] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('ref')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.backlog-adapters with a ref that fileExists rejects, when validateManifest runs, then error contains "references missing file"', () => {
  const sut = validateManifest;

  const result = sut(
    { extends: { 'backlog-adapters': [{ name: 'acme-tracker', ref: '.claude/workflow/acme-backlog.sh' }] } },
    { fileExists: NEVER_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('references missing file')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends block with two distinct faults, when validateManifest runs, then errors accumulate (≥2 errors)', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        phases: [
          { id: 'bench', procedure: 'pluginB:bench', archetype: 'bogus', contract: ['my-bespoke-floor'] },
        ],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 2, `expected ≥2 errors but got: ${JSON.stringify(result.errors)}`);
});

// EQUIVALENT (mutation survivor) — the ConditionalExpression at manifest.js:397
// (`typeof archetype !== 'string' || !VALID_ARCHETYPES.has(archetype)` → `false || …`) is a
// no-op: `!VALID_ARCHETYPES.has(x)` is already true for EVERY non-valid-archetype value
// (undefined, number, object, wrong string), so dropping the redundant `typeof` short-circuit
// yields identical results for all inputs — no test can distinguish it. The check below still
// pins the behaviour (a missing archetype is rejected); the typeof guard is defensive redundancy.
test('Given extends.phases with a phase missing archetype, when validateManifest runs, then ok:false with error naming archetype', () => {
  const sut = validateManifest;

  const result = sut(
    {
      extends: {
        phases: [
          { id: 'bench', procedure: 'pluginB:bench', contract: [] },
        ],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('archetype')), `errors: ${JSON.stringify(result.errors)}`);
});

// ─── extends top-level shape-rejection ───────────────────────────────────────

test('Given extends as a string, when validateManifest runs, then ok:false with error matching /extends must be an object/', () => {
  const result = validateManifest({ extends: 'bad' }, { fileExists: ALWAYS_EXISTS });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /extends must be an object/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases as an object (not array), when validateManifest runs, then ok:false with error matching /phases must be an array/', () => {
  const result = validateManifest({ extends: { phases: { id: 'x' } } }, { fileExists: ALWAYS_EXISTS });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /phases must be an array/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases[0] as a number, when validateManifest runs, then ok:false with error matching /must be an object/', () => {
  const result = validateManifest({ extends: { phases: [42] } }, { fileExists: ALWAYS_EXISTS });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /must be an object/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.agents as a string, when validateManifest runs, then ok:false with error matching /agents must be an array/', () => {
  const result = validateManifest({ extends: { agents: 'acme:runner' } }, { fileExists: ALWAYS_EXISTS });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /agents must be an array/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.profiles as an array, when validateManifest runs, then ok:false with error matching /profiles must be an object/', () => {
  const result = validateManifest({ extends: { profiles: [] } }, { fileExists: ALWAYS_EXISTS });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /profiles must be an object/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.profiles.audit as a string, when validateManifest runs, then ok:false with error matching /must be an object/', () => {
  const result = validateManifest({ extends: { profiles: { audit: 'inline' } } }, { fileExists: ALWAYS_EXISTS });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /must be an object/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.backlog-adapters as an object, when validateManifest runs, then ok:false with error matching /must be an array/', () => {
  const result = validateManifest({ extends: { 'backlog-adapters': { name: 'x' } } }, { fileExists: ALWAYS_EXISTS });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /must be an array/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.backlog-adapters entry missing name, when validateManifest runs, then ok:false with error matching /name/', () => {
  const result = validateManifest(
    { extends: { 'backlog-adapters': [{ ref: '.claude/workflow/x.sh' }] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /name/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

// ─── extends.phases optional-field validation ─────────────────────────────────

test('Given extends.phases[0] with after: 42 (non-string), when validateManifest runs, then ok:false with error matching /after.*must be a string/', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness', after: 42 }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /after.*must be a string/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases[0] with consumes: "change" (scalar), when validateManifest runs, then ok:false with error matching /consumes.*must be an array/', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness', consumes: 'change' }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /consumes.*must be an array/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases[0] with produces: [42] (non-string element), when validateManifest runs, then ok:false with error matching /produces.*must be a string/', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness', produces: [42] }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /produces.*must be a string/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

// ─── registeredBacklogNames: map/filter/optional-chaining survivors ───────────

test('Given registeredBacklogNames with a null adapter entry, when called, then null is excluded from the result set', () => {
  const sut = registeredBacklogNames;

  const result = sut({ 'backlog-adapters': [null, { name: 'acme-tracker' }] });

  assert.ok(!result.has(undefined), 'null entry must not contribute undefined to the set');
  assert.ok(result.has('acme-tracker'), 'valid named entry must be present');
});

test('Given registeredBacklogNames with an empty-string name, when called, then empty string is excluded from the result set', () => {
  const sut = registeredBacklogNames;

  const result = sut({ 'backlog-adapters': [{ name: '' }, { name: 'acme-tracker' }] });

  assert.ok(!result.has(''), 'empty-string name must be filtered out');
  assert.ok(result.has('acme-tracker'), 'valid name must remain');
});

test('Given registeredBacklogNames with a whitespace-only name, when called, then that name is excluded from the result set', () => {
  const sut = registeredBacklogNames;

  const result = sut({ 'backlog-adapters': [{ name: '   ' }, { name: 'acme-tracker' }] });

  assert.ok(!result.has('   '), 'whitespace-only name must be filtered out by trim check');
  assert.ok(result.has('acme-tracker'), 'valid name must remain');
});

test('Given registeredBacklogNames with a non-string name (number), when called, then number is excluded from the result set', () => {
  const sut = registeredBacklogNames;

  const result = sut({ 'backlog-adapters': [{ name: 42 }, { name: 'acme-tracker' }] });

  assert.ok(!result.has(42), 'non-string name must be filtered out by typeof string check');
  assert.ok(result.has('acme-tracker'), 'valid string name must remain');
});

// ─── validateExtendsPhaseOptionalStrings: each field name matters ─────────────

test('Given extends.phases[0] with role: 99 (non-string), when validateManifest runs, then ok:false with error naming "role"', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness', role: 99 }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /role.*must be a string/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases[0] with gate: true (non-string), when validateManifest runs, then ok:false with error naming "gate"', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness', gate: true }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /gate.*must be a string/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases[0] with before: 0 (non-string), when validateManifest runs, then ok:false with error naming "before"', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness', before: 0 }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /before.*must be a string/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

// ─── extends.phases: id and procedure trim/whitespace guard ──────────────────

test('Given extends.phases with a phase whose id is whitespace-only, when validateManifest runs, then ok:false with error naming "id"', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: '   ', procedure: 'acme:bench', archetype: 'harness' }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('id') && e.includes('non-empty')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases with a phase whose procedure is whitespace-only, when validateManifest runs, then ok:false with error naming "procedure"', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: '  ', archetype: 'harness' }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('procedure') && e.includes('non-empty')), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.phases with a phase whose archetype is a string but not in VALID_ARCHETYPES, when validateManifest runs, then error names each valid archetype', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'invalid-type' }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  const archetypeError = result.errors.find(e => e.includes('archetype'));
  assert.ok(archetypeError, `expected error mentioning archetype; errors: ${JSON.stringify(result.errors)}`);
  // The join(', ') separator distinguishes from join('') mutant — all six are present
  assert.ok(archetypeError.includes('setup'), `error must list setup; got: ${archetypeError}`);
  assert.ok(archetypeError.includes('harness'), `error must list harness; got: ${archetypeError}`);
  assert.ok(archetypeError.includes(', '), `error must use ", " separator; got: ${archetypeError}`);
});

// ─── extends.phases contract: BUNDLE_VOCAB join separator and array literal ───

test('Given extends.phases contract with an unknown bundle, when validateManifest runs, then error names the bad bundle AND uses ", " separator in the vocab list', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness', contract: ['not-a-bundle'] }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  const contractError = result.errors.find(e => e.includes('not-a-bundle'));
  assert.ok(contractError, `error must name the bad bundle; errors: ${JSON.stringify(result.errors)}`);
  // The [...BUNDLE_VOCAB].join(', ') must emit at least one ", " — ArrayDeclaration mutant would emit nothing
  assert.ok(contractError.includes(', '), `error must include ", " from BUNDLE_VOCAB list; got: ${contractError}`);
});

// ─── validateExtendsPhaseContract: contract undefined returns early (no error) ─

test('Given extends.phases with a phase omitting contract entirely, when validateManifest runs, then ok:true (contract is optional)', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness' }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `contract: undefined must be fine; errors: ${JSON.stringify(result.errors)}`);
});

// ─── validateExtendsPhaseStringArray: value undefined returns early (no error) ─

test('Given extends.phases with a phase omitting consumes entirely, when validateManifest runs, then ok:true (consumes is optional)', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness' }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `consumes: undefined must be fine; errors: ${JSON.stringify(result.errors)}`);
});

// ─── extends.agents: whitespace-only ref is rejected ────────────────────────

test('Given extends.agents with a whitespace-only string element, when validateManifest runs, then ok:false with error naming "agents"', () => {
  const result = validateManifest(
    { extends: { agents: ['  '] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('agents')), `errors: ${JSON.stringify(result.errors)}`);
});

// ─── extends.profiles: hasOwn archetype check ────────────────────────────────

test('Given extends.profiles.audit omitting harness key, when validateManifest runs, then ok:false with error naming "harness" as missing', () => {
  const result = validateManifest(
    {
      extends: {
        profiles: {
          audit: {
            setup: 'inline',
            specification: 'agent',
            construction: 'agent',
            // harness deliberately omitted
            refinement: 'agent',
            delivery: 'inline',
          },
        },
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  const missingError = result.errors.find(e => e.includes('harness') && e.includes('missing'));
  assert.ok(missingError, `expected a "missing archetype harness" error; errors: ${JSON.stringify(result.errors)}`);
});

// ─── extends.profiles guard: null and non-object inputs ──────────────────────

test('Given extends.profiles as null, when validateManifest runs, then ok:false with error matching /profiles must be an object/', () => {
  const result = validateManifest(
    { extends: { profiles: null } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /profiles must be an object/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.profiles as a string, when validateManifest runs, then ok:false with error matching /profiles must be an object/', () => {
  const result = validateManifest(
    { extends: { profiles: 'lean' } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /profiles must be an object/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

// ─── extends.backlog-adapters guard: null, non-object, array adapter entries ──

test('Given extends.backlog-adapters with a null entry, when validateManifest runs, then ok:false with error matching /must be an object/', () => {
  const result = validateManifest(
    { extends: { 'backlog-adapters': [null] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /must be an object/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.backlog-adapters with an array entry (nested array), when validateManifest runs, then ok:false with error matching /must be an object/', () => {
  const result = validateManifest(
    { extends: { 'backlog-adapters': [['name', 'val']] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /must be an object/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

test('Given extends.backlog-adapters with a non-object primitive entry (string), when validateManifest runs, then ok:false with error matching /must be an object/', () => {
  const result = validateManifest(
    { extends: { 'backlog-adapters': ['plain-string'] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /must be an object/.test(e)), `errors: ${JSON.stringify(result.errors)}`);
});

// ─── extends.backlog-adapters: name and ref whitespace trim guard ─────────────

test('Given extends.backlog-adapters with a whitespace-only name, when validateManifest runs, then ok:false with error naming "name" and "non-empty"', () => {
  const result = validateManifest(
    { extends: { 'backlog-adapters': [{ name: '   ', ref: '.claude/workflow/x.sh' }] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('name') && e.includes('non-empty')),
    `errors: ${JSON.stringify(result.errors)}`,
  );
});

test('Given extends.backlog-adapters with a whitespace-only ref, when validateManifest runs, then ok:false with error naming "ref" and "non-empty"', () => {
  const result = validateManifest(
    { extends: { 'backlog-adapters': [{ name: 'acme-tracker', ref: '  ' }] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('ref') && e.includes('non-empty')),
    `errors: ${JSON.stringify(result.errors)}`,
  );
});

// ─── extends.backlog-adapters: checkFileRef label text ───────────────────────

test('Given extends.backlog-adapters with a ref that fileExists rejects, when validateManifest runs, then error names the adapter label including its index', () => {
  const result = validateManifest(
    { extends: { 'backlog-adapters': [{ name: 'acme-tracker', ref: 'missing.sh' }] } },
    { fileExists: NEVER_EXISTS },
  );

  assert.equal(result.ok, false);
  const refError = result.errors.find(e => e.includes('backlog-adapters') && e.includes('[0]'));
  assert.ok(refError, `error must name the adapter label with index [0]; errors: ${JSON.stringify(result.errors)}`);
  assert.ok(refError.includes('ref'), `error must include "ref" in the label; got: ${refError}`);
});

// ─── validateExtends: backlog-adapters absent does not produce spurious error ─

test('Given extends block with only phases (no backlog-adapters key), when validateManifest runs, then ok:true (no spurious backlog-adapters error)', () => {
  const result = validateManifest(
    {
      extends: {
        phases: [{ id: 'bench', procedure: 'acme:bench', archetype: 'harness' }],
      },
    },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

// ─── extends.backlog-adapters error message: must continue after object-guard ─

test('Given extends.backlog-adapters with a null entry at index 1, when validateManifest runs, then error names index 1', () => {
  const result = validateManifest(
    { extends: { 'backlog-adapters': [{ name: 'a', ref: 'x.sh' }, null] } },
    { fileExists: ALWAYS_EXISTS },
  );

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('backlog-adapters[1]') && e.includes('must be an object')),
    `error must name index 1; errors: ${JSON.stringify(result.errors)}`,
  );
});
