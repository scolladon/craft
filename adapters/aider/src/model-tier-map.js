/**
 * craft tier → Aider `--model` id.
 *
 * Ids are pinned against the LIVE `aider --list-models` catalogue
 * (docs/adapters/aider-poc-record.md), never assumed. Aider bakes NO reasoning
 * effort into the model id — effort is a separate `--reasoning-effort` flag — so this
 * map is a plain tier→id, unlike Cursor's effort-suffixed ids.
 */
export const AIDER_TIER_MODELS = Object.freeze({
  opus: 'anthropic/claude-opus-4-6',
  sonnet: 'anthropic/claude-sonnet-4-6',
  haiku: 'anthropic/claude-haiku-4-5',
});

/**
 * Resolve tier → value from a default map, honoring override precedence.
 *
 * Own-property checks (Object.hasOwn) so an unknown tier fails loud instead of
 * resolving an inherited member (constructor, __proto__, …). An unknown tier with no
 * override is a runtime blocker — a tier resolving to no model must never pass silently.
 *
 * @param {string} tier
 * @param {Record<string, string>} defaults
 * @param {Record<string, string>} overrides
 * @param {string} label
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
 * Resolve tier → Aider `--model` id.
 *
 * @param {string} tier
 * @param {Record<string, string>} [overrides]
 * @returns {string}
 */
export function resolveAiderModel(tier, overrides = {}) {
  return resolveTierValue(tier, AIDER_TIER_MODELS, overrides, 'resolveAiderModel');
}
