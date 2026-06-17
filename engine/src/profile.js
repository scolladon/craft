/**
 * Profile expander — maps a named profile to a per-archetype execution map.
 * Closed vocabulary: 'solo', 'full', and 'lean' are valid.
 * The harness archetype is unconditionally forced to 'agent' after the map
 * lookup, regardless of what the map says.
 */

/** Harness archetype stays agent regardless of profile. */
export const HARNESS_ARCHETYPE = 'harness';

/**
 * Expand a named profile into a per-archetype execution map.
 * Keys are the six archetype strings; values are 'inline' | 'agent'.
 *
 * Profiles:
 *   solo: setup/specification/construction/refinement/delivery → inline; harness → agent
 *   lean: setup/specification/delivery → inline; construction/refinement/harness → agent
 *   full: all archetypes → agent
 *
 * Throws with a descriptive message for unknown profile names.
 *
 * @param {string} name
 * @returns {Record<string, 'inline' | 'agent'>}
 */
export function expandProfile(name) {
  switch (name) {
    case 'solo':
      return {
        setup:         'inline',
        specification: 'inline',
        construction:  'inline',
        harness:       'agent',
        refinement:    'inline',
        delivery:      'inline',
      };
    case 'lean':
      return {
        setup:         'inline',
        specification: 'inline',
        construction:  'agent',
        harness:       'agent',
        refinement:    'agent',
        delivery:      'inline',
      };
    case 'full':
      return {
        setup:         'agent',
        specification: 'agent',
        construction:  'agent',
        harness:       'agent',
        refinement:    'agent',
        delivery:      'agent',
      };
    default:
      throw new Error(
        `Unknown profile "${name}". Supported profiles: solo, full, lean.`,
      );
  }
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
