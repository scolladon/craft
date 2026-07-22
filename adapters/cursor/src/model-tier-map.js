/**
 * craft tier → Cursor `--model` id.
 *
 * Ids are pinned against the LIVE `cursor-agent --list-models` account catalogue
 * (2026.07.20), never assumed. Cursor bakes the reasoning effort INTO the model id
 * (`-low`/`-medium`/`-high`/`-xhigh`/`-max`), so a single tier→id map carries both the
 * model and its effort — there is no separate effort resolver (unlike codex, whose
 * effort is a distinct `--config` value). Cursor offers no `haiku`; craft's cheap tier
 * maps to `composer-2.5`, Cursor's fast in-house coding model.
 */
export const DEFAULT_TIER_MODELS = Object.freeze({
  opus: 'claude-opus-4-8-high',
  sonnet: 'claude-sonnet-5-high',
  haiku: 'composer-2.5',
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
 * Resolve tier → Cursor `--model` id.
 *
 * @param {string} tier
 * @param {Record<string, string>} [overrides]
 * @returns {string}
 */
export function resolveCursorModel(tier, overrides = {}) {
  return resolveTierValue(tier, DEFAULT_TIER_MODELS, overrides, 'resolveCursorModel');
}
