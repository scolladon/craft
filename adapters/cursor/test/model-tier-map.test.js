import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCursorModel, DEFAULT_TIER_MODELS } from '../src/model-tier-map.js';

describe('resolveCursorModel — tier → live-pinned Cursor model id', () => {
  it('Given tier opus, when resolved, then it is claude-opus-4-8-high', () => {
    assert.equal(resolveCursorModel('opus'), 'claude-opus-4-8-high');
  });

  it('Given tier sonnet, when resolved, then it is claude-sonnet-5-high', () => {
    assert.equal(resolveCursorModel('sonnet'), 'claude-sonnet-5-high');
  });

  it('Given tier haiku (no Cursor haiku), when resolved, then it is composer-2.5', () => {
    assert.equal(resolveCursorModel('haiku'), 'composer-2.5');
  });

  it('Given an override for a tier, when resolved, then the override wins over the default', () => {
    assert.equal(resolveCursorModel('opus', { opus: 'claude-opus-4-8-max' }), 'claude-opus-4-8-max');
  });

  it('Given an unknown tier with no override, when resolved, then it throws (fail-loud, never silent)', () => {
    assert.throws(() => resolveCursorModel('turbo'), /unknown tier "turbo"/);
  });

  it('Given a tier named like an inherited member, when resolved, then it fails loud (own-property discipline)', () => {
    assert.throws(() => resolveCursorModel('constructor'), /unknown tier/);
  });

  it('Given the default map, when inspected, then it is frozen (immutable)', () => {
    assert.ok(Object.isFrozen(DEFAULT_TIER_MODELS));
  });
});
