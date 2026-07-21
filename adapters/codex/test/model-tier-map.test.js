import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TIER_MODELS,
  DEFAULT_TIER_EFFORTS,
  resolveCodexModel,
  resolveCodexEffort,
} from '../src/model-tier-map.js';

const RESERVED_TIERS = ['__proto__', 'constructor', 'toString'];
const PINNED_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

describe('resolveCodexModel() — default tier resolution', () => {
  const cases = [
    ['opus', 'gpt-5.6-sol'],
    ['sonnet', 'gpt-5.6-terra'],
    ['haiku', 'gpt-5.4-mini'],
  ];

  for (const [tier, expected] of cases) {
    it(`Given tier "${tier}", when resolveCodexModel runs, then it returns "${expected}"`, () => {
      const sut = resolveCodexModel;

      const result = sut(tier);

      assert.equal(result, expected);
    });
  }
});

describe('resolveCodexModel() — override precedence', () => {
  it('Given tier "opus" and an explicit override, when resolveCodexModel runs, then the override wins over the committed default', () => {
    const sut = resolveCodexModel;

    const result = sut('opus', { opus: 'gpt-5.9-preview' });

    assert.equal(result, 'gpt-5.9-preview');
  });
});

describe('resolveCodexModel() — failure contract', () => {
  it('Given an unknown tier with no override, when resolveCodexModel runs, then it throws naming the tier', () => {
    const sut = resolveCodexModel;

    assert.throws(() => sut('nope'), /unknown tier "nope"/);
  });

  for (const reserved of RESERVED_TIERS) {
    it(`Given tier "${reserved}", when resolveCodexModel runs, then it throws rather than resolving an inherited member`, () => {
      const sut = resolveCodexModel;

      assert.throws(() => sut(reserved));
    });
  }
});

describe('resolveCodexEffort() — default tier resolution', () => {
  const cases = [
    ['opus', 'high'],
    ['sonnet', 'medium'],
    ['haiku', 'low'],
  ];

  for (const [tier, expected] of cases) {
    it(`Given tier "${tier}", when resolveCodexEffort runs, then it returns "${expected}"`, () => {
      const sut = resolveCodexEffort;

      const result = sut(tier);

      assert.equal(result, expected);
    });
  }
});

describe('resolveCodexEffort() — override precedence', () => {
  it('Given tier "sonnet" and an explicit override, when resolveCodexEffort runs, then the override wins over the committed default', () => {
    const sut = resolveCodexEffort;

    const result = sut('sonnet', { sonnet: 'xhigh' });

    assert.equal(result, 'xhigh');
  });
});

describe('resolveCodexEffort() — failure contract', () => {
  it('Given an unknown tier with no override, when resolveCodexEffort runs, then it throws naming the tier', () => {
    const sut = resolveCodexEffort;

    assert.throws(() => sut('nope'), /unknown tier "nope"/);
  });

  for (const reserved of RESERVED_TIERS) {
    it(`Given tier "${reserved}", when resolveCodexEffort runs, then it throws rather than resolving an inherited member`, () => {
      const sut = resolveCodexEffort;

      assert.throws(() => sut(reserved));
    });
  }
});

describe('DEFAULT_TIER_EFFORTS — no ultra', () => {
  it('Given the committed effort map, when every value is inspected, then none is "ultra"', () => {
    const sut = DEFAULT_TIER_EFFORTS;

    assert.ok(Object.values(sut).every((effort) => effort !== 'ultra'));
  });
});

describe('DEFAULT_TIER_EFFORTS — pinned enum membership', () => {
  it('Given every committed effort value, when checked against the pinned reasoning scale, then each is one of low|medium|high|xhigh|max', () => {
    const sut = DEFAULT_TIER_EFFORTS;

    for (const value of Object.values(sut)) {
      assert.ok(PINNED_EFFORTS.has(value), `effort "${value}" is outside the pinned reasoning scale`);
    }
  });
});

describe('DEFAULT_TIER_MODELS — immutability', () => {
  it('Given DEFAULT_TIER_MODELS, when a caller attempts to mutate it, then the value is unchanged', () => {
    const sut = DEFAULT_TIER_MODELS;
    const before = sut.opus;

    assert.throws(() => {
      sut.opus = 'mutated';
    }, TypeError);
    assert.equal(sut.opus, before);
  });
});

describe('DEFAULT_TIER_EFFORTS — immutability', () => {
  it('Given DEFAULT_TIER_EFFORTS, when a caller attempts to mutate it, then the value is unchanged', () => {
    const sut = DEFAULT_TIER_EFFORTS;
    const before = sut.opus;

    assert.throws(() => {
      sut.opus = 'mutated';
    }, TypeError);
    assert.equal(sut.opus, before);
  });
});
