import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyCliOverlay } from '../src/cli-overlay.js';

// ─── identity on empty overlay ────────────────────────────────────────────────

test('Given a manifest and an empty overlay, when applyCliOverlay is called, then it returns an equivalent manifest unchanged', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'solo', skip: ['planning'] }, context: 'hello' };

  const result = sut(manifest, {});

  assert.deepEqual(result, manifest);
});

// ─── profile override ─────────────────────────────────────────────────────────

test('Given a manifest with an existing profile and a profile overlay, when applyCliOverlay is called, then pipeline.profile is replaced by the overlay value', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'full' } };

  const result = sut(manifest, { profile: 'lean' });

  assert.equal(result.pipeline.profile, 'lean');
});

// ─── profile added when manifest has no pipeline key ─────────────────────────

test('Given a manifest with no pipeline key and a profile overlay, when applyCliOverlay is called, then pipeline.profile is set to the overlay value', () => {
  const sut = applyCliOverlay;
  const manifest = { context: 'hello' };

  const result = sut(manifest, { profile: 'solo' });

  assert.equal(result.pipeline.profile, 'solo');
});

// ─── skip unions with existing pipeline.skip ─────────────────────────────────

test('Given a manifest with existing pipeline.skip and a skip overlay, when applyCliOverlay is called, then skip is the union of existing and overlay values in order', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { skip: ['workspace', 'design'] } };

  const result = sut(manifest, { skip: ['planning', 'design'] });

  assert.deepEqual(result.pipeline.skip, ['workspace', 'design', 'planning']);
});

// ─── skip set when pipeline.skip absent ──────────────────────────────────────

test('Given a manifest with no pipeline.skip and a skip overlay, when applyCliOverlay is called, then pipeline.skip is set to the overlay values', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'solo' } };

  const result = sut(manifest, { skip: ['planning', 'review'] });

  assert.deepEqual(result.pipeline.skip, ['planning', 'review']);
});

// ─── both profile and skip applied together ───────────────────────────────────

test('Given a manifest and an overlay with both profile and skip, when applyCliOverlay is called, then both are applied', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { skip: ['workspace'] } };

  const result = sut(manifest, { profile: 'lean', skip: ['planning'] });

  assert.equal(result.pipeline.profile, 'lean');
  assert.deepEqual(result.pipeline.skip, ['workspace', 'planning']);
});

// ─── empty manifest object (the no-manifest bin path) ────────────────────────

test('Given an empty manifest object and a profile overlay, when applyCliOverlay is called, then pipeline.profile is set to the overlay value', () => {
  const sut = applyCliOverlay;
  const manifest = {};

  const result = sut(manifest, { profile: 'solo' });

  assert.equal(result.pipeline.profile, 'solo');
});

// ─── input manifest NOT mutated ───────────────────────────────────────────────

test('Given a manifest, when applyCliOverlay is called with profile and skip overlays, then the original manifest is not mutated', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'full', skip: ['design'] } };
  const originalProfile = manifest.pipeline.profile;
  const originalSkip = [...manifest.pipeline.skip];

  const result = sut(manifest, { profile: 'solo', skip: ['planning'] });

  assert.equal(manifest.pipeline.profile, originalProfile);
  assert.deepEqual(manifest.pipeline.skip, originalSkip);
  assert.notStrictEqual(result.pipeline, manifest.pipeline, 'result.pipeline must be a fresh object, not the input reference');
});

// ─── harness nested write + immutability ─────────────────────────────────────

test('Given a manifest and harness overlay setting review.passes=2, when applyCliOverlay is called, then result.phases.review.harness.passes is 2 and input is not mutated', () => {
  const sut = applyCliOverlay;
  const manifest = {};
  const harness = [{ phase: 'review', knob: 'passes', value: 2 }];

  const result = sut(manifest, { harness });

  assert.equal(result.phases.review.harness.passes, 2);
  assert.equal(manifest.phases, undefined, 'input must not be mutated');
  assert.notStrictEqual(result.phases, manifest.phases);
});

// ─── harness deep-merge preserves siblings ────────────────────────────────────

test('Given a manifest with phases.review.harness.convergence="low-only" and harness overlay setting passes=2, when applyCliOverlay is called, then convergence is preserved and passes is added', () => {
  const sut = applyCliOverlay;
  const manifest = { phases: { review: { harness: { convergence: 'low-only' } } } };
  const harness = [{ phase: 'review', knob: 'passes', value: 2 }];

  const result = sut(manifest, { harness });

  assert.equal(result.phases.review.harness.convergence, 'low-only');
  assert.equal(result.phases.review.harness.passes, 2);
  assert.notStrictEqual(result.phases.review.harness, manifest.phases.review.harness);
});

// ─── harness multi-phase overlay ─────────────────────────────────────────────

test('Given harness overlay for two distinct phases, when applyCliOverlay is called, then both phase blocks carry the knob and unrelated phases are untouched', () => {
  const sut = applyCliOverlay;
  const manifest = { phases: { design: { harness: { tool: 'jest' } } } };
  const harness = [
    { phase: 'review', knob: 'passes', value: 2 },
    { phase: 'validation', knob: 'incremental', value: true },
  ];

  const result = sut(manifest, { harness });

  assert.equal(result.phases.review.harness.passes, 2);
  assert.equal(result.phases.validation.harness.incremental, true);
  assert.equal(result.phases.design.harness.tool, 'jest');
});

// ─── harness + profile + skip fold together ───────────────────────────────────

test('Given harness, profile, and skip overlays, when applyCliOverlay is called, then all three are applied', () => {
  const sut = applyCliOverlay;
  const manifest = {};
  const harness = [{ phase: 'review', knob: 'passes', value: 3 }];

  const result = sut(manifest, { profile: 'lean', skip: ['decisions'], harness });

  assert.equal(result.pipeline.profile, 'lean');
  assert.deepEqual(result.pipeline.skip, ['decisions']);
  assert.equal(result.phases.review.harness.passes, 3);
});

// ─── harness idempotence ─────────────────────────────────────────────────────

test('Given the same harness overlay applied twice, when applyCliOverlay is called on each result, then both results are deep-equal', () => {
  const sut = applyCliOverlay;
  const manifest = { phases: { review: { harness: { convergence: 'none' } } } };
  const harness = [{ phase: 'review', knob: 'passes', value: 2 }];

  const first = sut(manifest, { harness });
  const second = sut(first, { harness });

  assert.deepEqual(first.phases.review.harness, second.phases.review.harness);
});

// ─── harness empty array identity (guard existing 8 tests) ───────────────────

test('Given an empty harness array, when applyCliOverlay is called, then result is identical to applying no harness overlay', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'lean' } };

  const withEmpty = sut(manifest, { harness: [] });
  const withUndefined = sut(manifest, {});

  assert.deepEqual(withEmpty, withUndefined);
});

// ─── 61:7 early-return path: pipeline cloned when overlay is fully absent ────
// Kills: ConditionalExpression(false) at cli-overlay.js:61 — mutant bypasses the early-return
// block, so `base = {...manifest}` is returned without cloning pipeline. The original path returns
// `{ ...manifest, pipeline: { ...manifest.pipeline } }` (fresh pipeline object), which the mutant
// does NOT produce; checking reference inequality distinguishes them.

test('Given a manifest with a pipeline key and a fully-absent overlay, when applyCliOverlay is called, then the returned pipeline is a fresh object (not the original reference)', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'solo', skip: ['planning'] }, context: 'hello' };

  const result = sut(manifest, {});

  assert.notStrictEqual(result.pipeline, manifest.pipeline, 'pipeline must be a fresh object on the early-return path');
  assert.deepEqual(result.pipeline, manifest.pipeline);
});

// ─── 67:16 ObjectLiteral: non-phase manifest fields survive a harness-only overlay ──
// Kills: ObjectLiteral({} at cli-overlay.js:67) — mutant sets base={}, discarding all existing
// manifest fields. Checking that a non-phase top-level field (context) is preserved distinguishes.

test('Given a manifest with a context field and a harness-only overlay, when applyCliOverlay is called, then the context field is preserved in the result', () => {
  const sut = applyCliOverlay;
  const manifest = { context: 'my-context', phases: {} };
  const harness = [{ phase: 'review', knob: 'passes', value: 2 }];

  const result = sut(manifest, { harness });

  assert.equal(result.context, 'my-context', 'non-phase manifest fields must survive a harness-only overlay');
});

// ─── 73:7 / 73:32: harness-only overlay must NOT inject a pipeline key ────────
// Kills: ConditionalExpression(false) and BlockStatement removal at cli-overlay.js:73 — both
// mutants fall through to the pipeline-merge path, which constructs `mergedPipeline = {}` and
// returns `{ ...base, pipeline: {} }`, adding a spurious pipeline key. The original early-returns
// `base` before the pipeline block. A manifest with no pipeline key must stay pipeline-less.

test('Given a manifest with no pipeline key and a harness-only overlay, when applyCliOverlay is called, then the result has no pipeline key', () => {
  const sut = applyCliOverlay;
  const manifest = { phases: {} };
  const harness = [{ phase: 'review', knob: 'passes', value: 2 }];

  const result = sut(manifest, { harness });

  assert.equal(result.pipeline, undefined, 'a harness-only overlay must not inject a pipeline key');
});

// ─── named-config precedence: CLI --profile wins over named manifest ──────────

test('Given named config pipeline.profile "full" and CLI --profile "lean", when applyCliOverlay folds, then pipeline.profile is lean (CLI wins over named manifest)', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'full' } };

  const result = sut(manifest, { profile: 'lean' });

  assert.equal(result.pipeline.profile, 'lean');
});

// ─── named-config precedence: no CLI profile → named manifest honoured ────────

test('Given named config pipeline.profile "full" and no CLI profile, when applyCliOverlay folds, then pipeline.profile stays full (named manifest honoured)', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'full' } };

  const result = sut(manifest, {});

  assert.equal(result.pipeline.profile, 'full');
});

// ─── named-config precedence: CLI --skip applies over named manifest ──────────

test('Given named config and CLI --skip, when applyCliOverlay folds, then skip applies over named manifest', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'full', skip: ['decisions'] } };

  const result = sut(manifest, { skip: ['review'] });

  assert.deepEqual(result.pipeline.skip, ['decisions', 'review']);
  assert.equal(result.pipeline.profile, 'full');
});

// ─── named-config precedence: non-profile keys survive a profile-only overlay ─

test('Given named config with context key and CLI --profile overlay, when applyCliOverlay folds, then non-profile keys survive in result', () => {
  const sut = applyCliOverlay;
  const manifest = { pipeline: { profile: 'full' }, context: 'docs/rules.md' };

  const result = sut(manifest, { profile: 'lean' });

  assert.equal(result.pipeline.profile, 'lean');
  assert.equal(result.context, 'docs/rules.md');
});
