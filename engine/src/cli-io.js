/**
 * Shared CLI I/O helpers for the engine's CLI mains, plus a pure
 * non-empty-string predicate that intention.js shares with them: never-throw
 * regular-file and directory predicates, a stderr-and-fail-exit helper, a
 * repo-root walk, and the two exit-code constants.
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

/**
 * Directory predicate mirroring the bash `[ -d <path> ]` test: true only for an
 * existing directory, never throws.
 * @param {string} p
 * @returns {boolean}
 */
export function isDirectoryPath(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
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
