/**
 * Shared CLI I/O helpers for the config-resolve/init-land/promote-plan mains:
 * a never-throw regular-file predicate, a stderr-and-fail-exit helper, and the
 * two exit-code constants they all share.
 */

import { statSync } from 'node:fs';

export const EXIT_OK = 0;
export const EXIT_ERR = 1;

/**
 * Regular-file predicate mirroring the bash `[ -f <path> ]` test: true only for an
 * existing regular file, never throws.
 * @param {string} p
 * @returns {boolean}
 */
export function isRegularFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false; // equivalent mutant (empty catch): undefined is falsy — same observable effect
  }
}

export function fail(io, message) {
  io.stderr.write(message);
  return EXIT_ERR;
}
