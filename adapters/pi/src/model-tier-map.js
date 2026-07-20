export const DEFAULT_TIER_MODELS = Object.freeze({
  opus: 'anthropic/claude-opus-4-5',
  sonnet: 'anthropic/claude-sonnet-4-5',
  haiku: 'anthropic/claude-haiku-4-5',
});

/**
 * Resolve tier → `provider/model` string for pi config authoring.
 *
 * Precedence: an explicit override for the tier wins over the committed
 * default map. An unknown tier with no override is a runtime blocker
 * (fail-loud) — a tier resolving to no provider must never pass silently.
 *
 * @param {string} tier
 * @param {Record<string, string>} [overrides]
 * @returns {string}
 */
export function resolvePiModel(tier, overrides = {}) {
  // Own-property checks: a bare `overrides[tier]` / `DEFAULT_TIER_MODELS[tier]`
  // would resolve inherited members (constructor, __proto__, …) instead of
  // failing loud on an unknown tier.
  if (Object.hasOwn(overrides, tier)) {
    return overrides[tier];
  }

  if (Object.hasOwn(DEFAULT_TIER_MODELS, tier)) {
    return DEFAULT_TIER_MODELS[tier];
  }

  throw new Error(`resolvePiModel: unknown tier "${tier}" has no override and no default`);
}
