/**
 * Profile expander — maps a named profile to a per-archetype execution map.
 * Built-in vocabulary: 'solo', 'full', and 'lean'. Registered profiles from
 * the manifest's extends.profiles map are also accepted.
 * The harness archetype is unconditionally forced to 'agent' after the map
 * lookup, regardless of what the map says.
 */

/** Harness archetype stays agent regardless of profile. */
export const HARNESS_ARCHETYPE = 'harness';

const BUILTIN_PROFILES = Object.freeze({
  solo: Object.freeze({
    setup:         'inline',
    specification: 'inline',
    construction:  'inline',
    harness:       'agent',
    refinement:    'inline',
    delivery:      'inline',
  }),
  lean: Object.freeze({
    setup:         'inline',
    specification: 'inline',
    construction:  'agent',
    harness:       'agent',
    refinement:    'agent',
    delivery:      'inline',
  }),
  full: Object.freeze({
    setup:         'agent',
    specification: 'agent',
    construction:  'agent',
    harness:       'agent',
    refinement:    'agent',
    delivery:      'agent',
  }),
});

/**
 * Expand a named profile into a per-archetype execution map.
 * Keys are the six archetype strings; values are 'inline' | 'agent'.
 *
 * Built-in profiles (solo/lean/full) take precedence; registered profiles
 * from extends.profiles are consulted next. Throws for truly unknown names.
 *
 * @param {string} name
 * @param {Record<string, Record<string, 'inline' | 'agent'>>} [registeredProfiles]
 * @returns {Record<string, 'inline' | 'agent'>}
 */
export function expandProfile(name, registeredProfiles = {}) {
  if (BUILTIN_PROFILES[name]) return BUILTIN_PROFILES[name];
  if (registeredProfiles[name]) return registeredProfiles[name];
  throw new Error(
    `Unknown profile "${name}". Supported profiles: solo, full, lean.`,
  );
}

/**
 * Apply a per-archetype profile map to a descriptor's archetype, returning the
 * resolved execution mode. The harness archetype is forced to 'agent' before the
 * map is consulted — the parallelism caveat binds regardless of the map (and of
 * any future profile that mis-sets it).
 *
 * @param {Record<string, 'inline' | 'agent'>} profile
 * @param {string} archetype
 * @returns {'inline' | 'agent'}
 */
export function applyProfileToArchetype(profile, archetype) {
  if (archetype === HARNESS_ARCHETYPE) return 'agent';
  return profile[archetype] ?? 'agent';
}
