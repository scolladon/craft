export const DEFAULT_TIER_MODELS = Object.freeze({
  opus: 'auto',
  sonnet: 'auto',
  haiku: 'auto',
});

export const DEFAULT_TIER_EFFORTS = Object.freeze({
  opus: 'high',
  sonnet: 'medium',
  haiku: 'low',
});

/**
 * Resolve tier → value from a default map, honoring override precedence.
 *
 * Precedence: an explicit override for the tier wins over the committed
 * default map. An unknown tier with no override is a runtime blocker
 * (fail-loud) — a tier resolving to no value must never pass silently.
 *
 * Own-property checks: a bare `overrides[tier]` / `defaults[tier]` would
 * resolve inherited members (constructor, __proto__, …) instead of failing
 * loud on an unknown tier.
 *
 * @param {string} tier
 * @param {Record<string, string>} defaults
 * @param {Record<string, string>} overrides
 * @param {string} label - resolver name, used in the thrown error message
 * @returns {string}
 */
function resolveTierValue(tier, defaults, overrides, label) {
  if (Object.hasOwn(overrides, tier)) {
    return overrides[tier];
  }

  if (Object.hasOwn(defaults, tier)) {
    return defaults[tier];
  }

  throw new Error(`${label}: unknown tier "${tier}" has no override and no default`);
}

/**
 * Resolve tier → Copilot `--model` value.
 *
 * @param {string} tier
 * @param {Record<string, string>} [overrides]
 * @returns {string}
 */
export function resolveCopilotModel(tier, overrides = {}) {
  return resolveTierValue(tier, DEFAULT_TIER_MODELS, overrides, 'resolveCopilotModel');
}

/**
 * Resolve tier → Copilot `--effort` value.
 *
 * @param {string} tier
 * @param {Record<string, string>} [overrides]
 * @returns {string}
 */
export function resolveCopilotEffort(tier, overrides = {}) {
  return resolveTierValue(tier, DEFAULT_TIER_EFFORTS, overrides, 'resolveCopilotEffort');
}
