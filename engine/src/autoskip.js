/**
 * Auto-skip eligibility helper — pure static resolver-side check.
 * Pure; no I/O, never mutates inputs; never throws for a valid effective descriptor
 * (the only call path — resolve.js maps over concrete descriptors).
 */

import { checkStrandedConsumers } from './strand.js';

/** Four floor phases categorically never auto-skippable (in code, never config). */
export const FLOOR_PHASES = Object.freeze(new Set([
  'workspace', 'implementation', 'propose', 'integrate',
]));

/**
 * Returns true if the `required` field on the manifest phase block is strictly true.
 * Absent or non-boolean ⇒ not required.
 * @param {string} id
 * @param {object|null|undefined} manifest
 * @returns {boolean}
 */
function isRequired(id, manifest) {
  return manifest?.phases?.[id]?.required === true;
}

/**
 * Pure static eligibility: may an effective descriptor be auto-skipped?
 * eligible ⇔ NOT floor phase ∧ NOT required:true ∧ checkStrandedConsumers(...{id}...) === [].
 * No code-producing rule, no archetype allowlist. Never throws, never mutates.
 *
 * @param {object} descriptor - one effective descriptor (carries .id)
 * @param {object|null|undefined} manifest - (alias-resolved) manifest, for required: lookup
 * @param {readonly object[]} effective - full effective descriptor list
 * @param {readonly object[]} defaults - original defaults BEFORE edits (strand's first arg)
 * @returns {boolean}
 */
export function computeAutoSkipEligibility(descriptor, manifest, effective, defaults) {
  if (FLOOR_PHASES.has(descriptor.id)) return false;
  if (isRequired(descriptor.id, manifest)) return false;
  if (checkStrandedConsumers(defaults, new Set([descriptor.id]), effective).length > 0) return false;
  return true;
}
