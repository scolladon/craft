/**
 * Shared executing-harness predicate and contract constant.
 * Extracted from gates.js so both gates.js and resolve.js bind one definition.
 */

import { HARNESS_ARCHETYPE } from './profile.js';

/**
 * The executing-harness contract bundle that distinguishes executing-harness
 * (harness-exec) from read-harness (harness-read).
 */
export const EXECUTING_HARNESS_CONTRACT = 'harness-exec';

/**
 * Determine whether a descriptor is an executing-harness phase.
 * An executing-harness has archetype === harness and carries the harness-exec contract bundle.
 *
 * @param {object} descriptor
 * @returns {boolean}
 */
export function isExecutingHarness(descriptor) {
  return (
    descriptor.archetype === HARNESS_ARCHETYPE &&
    descriptor.contract.includes(EXECUTING_HARNESS_CONTRACT)
  );
}
