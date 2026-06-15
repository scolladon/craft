/**
 * Profile expander — maps a named profile to a set of per-phase execution edits.
 * Closed vocabulary: only 'solo' and 'full' are valid.
 * The SP1 parallelism caveat is encoded as a static archetype rule:
 * harness-archetype phases stay 'agent' even under the solo profile.
 */

/**
 * @typedef {{ execution: 'inline' | 'agent', harnessOverride?: boolean }} ProfileEdits
 */

/** Harness archetype stays agent regardless of profile. */
const HARNESS_ARCHETYPE = 'harness';

/**
 * Expand a named profile into an object describing how to override execution.
 * Returns an object with:
 *   - harnessStaysAgent: boolean — if true, harness-archetype phases keep 'agent'
 *   - defaultExecution: 'inline' | 'agent' — execution to apply to non-harness phases
 *
 * Throws with a descriptive message for unknown profile names.
 *
 * @param {string} name
 * @returns {{ defaultExecution: 'inline' | 'agent', harnessStaysAgent: boolean }}
 */
export function expandProfile(name) {
  switch (name) {
    case 'solo':
      return { defaultExecution: 'inline', harnessStaysAgent: true };
    case 'full':
      return { defaultExecution: 'agent', harnessStaysAgent: false };
    default:
      throw new Error(
        `Unknown profile "${name}". Supported profiles: solo, full.`,
      );
  }
}

/**
 * Apply a profile to a descriptor's archetype, returning the resolved execution mode.
 * If harnessStaysAgent is true and the archetype is 'harness', returns 'agent'.
 * Otherwise returns the profile's defaultExecution.
 *
 * @param {{ defaultExecution: 'inline' | 'agent', harnessStaysAgent: boolean }} profile
 * @param {string} archetype
 * @returns {'inline' | 'agent'}
 */
export function applyProfileToArchetype(profile, archetype) {
  if (profile.harnessStaysAgent && archetype === HARNESS_ARCHETYPE) {
    return 'agent';
  }
  return profile.defaultExecution;
}
