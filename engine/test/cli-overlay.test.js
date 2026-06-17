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
