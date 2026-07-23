import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAiderModel, AIDER_TIER_MODELS } from '../src/model-tier-map.js';

describe('resolveAiderModel — tier → live-pinned Aider model id', () => {
  it('Given tier opus, when resolved, then it is anthropic/claude-opus-4-6', () => {
    assert.equal(resolveAiderModel('opus'), 'anthropic/claude-opus-4-6');
  });

  it('Given tier sonnet, when resolved, then it is anthropic/claude-sonnet-4-6', () => {
    assert.equal(resolveAiderModel('sonnet'), 'anthropic/claude-sonnet-4-6');
  });

  it('Given tier haiku, when resolved, then it is anthropic/claude-haiku-4-5', () => {
    assert.equal(resolveAiderModel('haiku'), 'anthropic/claude-haiku-4-5');
  });

  it('Given an override for a tier, when resolved, then the override wins over the default', () => {
    assert.equal(
      resolveAiderModel('opus', { opus: 'anthropic/claude-opus-4-6-custom' }),
      'anthropic/claude-opus-4-6-custom',
    );
  });

  it('Given an unknown tier with no override, when resolved, then it throws (fail-loud, never silent)', () => {
    assert.throws(() => resolveAiderModel('turbo'), /unknown tier "turbo"/);
  });

  it('Given a tier named like an inherited member, when resolved, then it fails loud (own-property discipline)', () => {
    assert.throws(() => resolveAiderModel('constructor'), /unknown tier/);
  });

  it('Given the default map, when inspected, then it is frozen (immutable)', () => {
    assert.ok(Object.isFrozen(AIDER_TIER_MODELS));
  });
});
