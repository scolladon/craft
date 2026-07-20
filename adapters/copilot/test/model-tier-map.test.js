import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TIER_MODELS,
  DEFAULT_TIER_EFFORTS,
  resolveCopilotModel,
  resolveCopilotEffort,
} from '../src/model-tier-map.js';

const RESERVED_TIERS = ['__proto__', 'constructor', 'hasOwnProperty'];
const PINNED_EFFORTS = new Set(['none', 'low', 'medium', 'high', 'xhigh', 'max']);

describe('resolveCopilotModel() — default tier resolution', () => {
  const cases = [
    ['opus', DEFAULT_TIER_MODELS.opus],
    ['sonnet', DEFAULT_TIER_MODELS.sonnet],
    ['haiku', DEFAULT_TIER_MODELS.haiku],
  ];

  for (const [tier, expected] of cases) {
    it(`Given tier "${tier}" with no overrides, when resolved, then returns the committed default`, () => {
      const sut = resolveCopilotModel;

      const result = sut(tier);

      assert.equal(result, expected);
    });
  }
});

describe('resolveCopilotModel() — override precedence', () => {
  it('Given an override for the tier, when resolved, then the override wins over the committed default', () => {
    const sut = resolveCopilotModel;

    const result = sut('sonnet', { sonnet: 'gpt-5' });

    assert.equal(result, 'gpt-5');
  });
});

describe('resolveCopilotModel() — failure contract', () => {
  it('Given an unknown tier with no override, when resolved, then throws naming the offending tier', () => {
    const sut = resolveCopilotModel;

    assert.throws(() => sut('nope'), /unknown tier "nope"/);
  });

  for (const reserved of RESERVED_TIERS) {
    it(`Given the inherited member "${reserved}" as a tier, when resolved, then throws rather than resolving an inherited value`, () => {
      const sut = resolveCopilotModel;

      assert.throws(() => sut(reserved));
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

describe('resolveCopilotEffort() — default tier resolution', () => {
  const cases = [
    ['opus', DEFAULT_TIER_EFFORTS.opus],
    ['sonnet', DEFAULT_TIER_EFFORTS.sonnet],
    ['haiku', DEFAULT_TIER_EFFORTS.haiku],
  ];

  for (const [tier, expected] of cases) {
    it(`Given tier "${tier}" with no overrides, when resolved, then returns the committed default effort`, () => {
      const sut = resolveCopilotEffort;

      const result = sut(tier);

      assert.equal(result, expected);
    });
  }
});

describe('resolveCopilotEffort() — override precedence', () => {
  it('Given an override for the tier, when resolved, then the override wins over the committed default', () => {
    const sut = resolveCopilotEffort;

    const result = sut('sonnet', { sonnet: 'max' });

    assert.equal(result, 'max');
  });
});

describe('resolveCopilotEffort() — failure contract', () => {
  it('Given an unknown tier with no override, when resolved, then throws naming the offending tier', () => {
    const sut = resolveCopilotEffort;

    assert.throws(() => sut('nope'), /unknown tier "nope"/);
  });

  for (const reserved of RESERVED_TIERS) {
    it(`Given the inherited member "${reserved}" as a tier, when resolved, then throws rather than resolving an inherited value`, () => {
      const sut = resolveCopilotEffort;

      assert.throws(() => sut(reserved));
    });
  }
});

describe('DEFAULT_TIER_EFFORTS — pinned enum membership', () => {
  it('Given every tier in DEFAULT_TIER_MODELS, when the effort map is consulted, then each tier has an effort from the pinned enum', () => {
    const sut = DEFAULT_TIER_EFFORTS;

    for (const tier of Object.keys(DEFAULT_TIER_MODELS)) {
      assert.ok(PINNED_EFFORTS.has(sut[tier]), `tier "${tier}" has effort "${sut[tier]}" outside the pinned enum`);
    }
  });
});
