export const DEFAULT_TIER_MODELS = Object.freeze({
  opus: 'gpt-5.6-sol',
  sonnet: 'gpt-5.6-terra',
  haiku: 'gpt-5.4-mini',
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
 * (fail-loud) — a tier resolving to no value must never pass silently. An
 * unknown Codex model id does not error at the CLI level: it falls back with
 * a warning and *changes which tools get registered*, so a typo here is a
 * silent topology bug, not just a wrong string.
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
 * Resolve tier → Codex `--model` value.
 *
 * @param {string} tier
 * @param {Record<string, string>} [overrides]
 * @returns {string}
 */
export function resolveCodexModel(tier, overrides = {}) {
  return resolveTierValue(tier, DEFAULT_TIER_MODELS, overrides, 'resolveCodexModel');
}

/**
 * Resolve tier → Codex `--config model_reasoning_effort` value.
 *
 * @param {string} tier
 * @param {Record<string, string>} [overrides]
 * @returns {string}
 */
export function resolveCodexEffort(tier, overrides = {}) {
  return resolveTierValue(tier, DEFAULT_TIER_EFFORTS, overrides, 'resolveCodexEffort');
}
