/**
 * Shared CLI I/O helpers for the engine's CLI mains, plus a pure
 * non-empty-string predicate that intention.js shares with them: never-throw
 * regular-file and directory predicates, a stderr-and-fail-exit helper, a
 * repo-root walk, an entry-point predicate for the bins, and the two exit-code constants.
 */

import { statSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * True when the module described by meta is the process entry script named by argv[1].
 * Both sides are real-pathed: Node real-paths the main module's URL but keeps argv[1]
 * as typed, and --preserve-symlinks-main keeps the URL symlinked instead.
 * @param {{ url: string }} meta - the caller's import.meta
 * @param {readonly unknown[]} [argv] - the process argv; argv[1] names the entry script
 * @returns {boolean}
 */
export function isEntryPoint(meta, argv = process.argv) {
  const argv1 = argv[1];
  // realpathSync(undefined) resolves <cwd>/undefined, so an absent argv[1] must never reach it.
  if (!isNonEmptyString(argv1)) return false;
  return realPathOrNull(argv1) === realpathSync(fileURLToPath(meta.url));
}

function realPathOrNull(path) {
  try {
    return realpathSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
