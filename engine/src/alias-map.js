/**
 * Shared old→new phase alias table.
 * The single authoritative source for old name → canonical id mapping.
 * Consumers (the resolver, the future lint consumer) bind here — no second copy.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ALIAS_MAP = Object.freeze({
  branch:    'workspace',
  prd:       'requirements',
  adr:       'decisions',
  plan:      'planning',
  implement: 'implementation',
  mutation:  'validation',
  refactor:  'refactoring',
  docs:      'documentation',
  pr:        'propose',
  merge:     'integrate',
});

/**
 * Resolve a phase name to its canonical id.
 * Returns the canonical id for a known alias, or the input unchanged for
 * an already-canonical id or any unknown-but-valid id. Never throws.
 *
 * @param {string} name
 * @returns {string}
 */
export function resolveAlias(name) {
  // Own-property lookup only — a name like "constructor" must not resolve to an
  // inherited Object.prototype member.
  return Object.hasOwn(ALIAS_MAP, name) ? ALIAS_MAP[name] : name;
}
