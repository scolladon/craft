import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TIER_MODELS, resolveOpencodeModel } from '../src/model-tier-map.js';

describe('resolveOpencodeModel() — default tier resolution', () => {
  const cases = [
    ['opus', DEFAULT_TIER_MODELS.opus],
    ['sonnet', DEFAULT_TIER_MODELS.sonnet],
    ['haiku', DEFAULT_TIER_MODELS.haiku],
  ];

  for (const [tier, expected] of cases) {
    it(`Given tier "${tier}" with no overrides, when resolved, then returns the default model`, () => {
      const sut = resolveOpencodeModel;

      const result = sut(tier);

      assert.equal(result, expected);
    });
  }
});

describe('resolveOpencodeModel() — override precedence', () => {
  it('Given an override for the tier, when resolved, then the override wins over the default', () => {
    const sut = resolveOpencodeModel;

    const result = sut('sonnet', { sonnet: 'google/gemini-2.5-flash' });

    assert.equal(result, 'google/gemini-2.5-flash');
  });
});

describe('resolveOpencodeModel() — failure contract', () => {
  it('Given an unknown tier with no override, when resolved, then throws naming the offending tier', () => {
    const sut = resolveOpencodeModel;

    assert.throws(() => sut('mega'), /mega/);
  });

  for (const reserved of ['constructor', '__proto__', 'hasOwnProperty', 'toString']) {
    it(`Given the inherited-member tier "${reserved}" with no override, when resolved, then throws instead of leaking a prototype member`, () => {
      const sut = resolveOpencodeModel;

      assert.throws(() => sut(reserved), new RegExp(reserved.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  }
});

describe('DEFAULT_TIER_MODELS — immutability', () => {
  it('Given a mutation attempt on a frozen entry, when applied, then the value stays unchanged', () => {
    const sut = DEFAULT_TIER_MODELS;
    const before = sut.opus;

    assert.throws(() => {
      sut.opus = 'mutated';
    }, TypeError);
    assert.equal(sut.opus, before);
  });
});
