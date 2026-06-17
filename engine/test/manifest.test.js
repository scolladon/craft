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
