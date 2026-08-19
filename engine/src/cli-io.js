/**
 * Shared CLI I/O helpers for the config-resolve/init-land/promote-plan mains:
 * a never-throw regular-file predicate, a stderr-and-fail-exit helper, a
 * repo-root walk, and the two exit-code constants they all share.
 */

import { statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

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

/**
 * Walk up from startDir to the nearest ancestor carrying a `.git` entry
 * (file or directory — a worktree's `.git` is a file), falling back to
 * startDir when none is found.
 * @param {string} startDir
 * @returns {string}
 */
export function findRepoRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}
