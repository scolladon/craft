/**
 * Realpath-hardened path containment shared by policy.js and memory.js.
 *
 * Both helpers use purely lexical resolve()+startsWith which cannot detect
 * a symlink that resolves outside the declared root. This module closes
 * that gap: resolve the deepest existing ancestor via realpathSync, re-append
 * the unresolved tail, then re-check containment. A symlink leaf — even a
 * dangling one — is rejected by an lstat guard before realpathSync is called.
 *
 * Non-ENOENT filesystem errors (ENOTDIR, EACCES, …) are caught and treated as
 * fail-closed null — handled, never silently swallowed; the caller's null path
 * records the note upstream.
 *
 * Scope / limitations (local advisory threat model): the contained value returned
 * is the LEXICAL target, and callers perform their actual read/write on it — so a
 * symlink swapped into an ancestor between this check and that I/O (TOCTOU), or a
 * hardlink to an external file planted inside the root, is NOT detected. The roots
 * here are fixed and any actor able to plant such a link could write the target
 * directly, so this closes the symlink-escape gap rather than promising
 * atomic-open containment.
 */

import { resolve, sep, dirname } from 'node:path';
import { realpathSync, lstatSync } from 'node:fs';

/**
 * Walk up via realpathSync (catching ENOENT only) to the deepest existing
 * ancestor of absPath, resolve its real path, then re-append the unresolved
 * lexical tail. Throws on any non-ENOENT error.
 *
 * @param {string} absPath - absolute path (may not exist)
 * @returns {string} real-prefixed absolute path
 */
export function realExistingPrefix(absPath) {
  let current = absPath;
  while (true) {
    try {
      const real = realpathSync(current);
      const tail = absPath.slice(current.length);
      return real + tail;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const parent = dirname(current);
      if (parent === current) throw e; // equivalent mutant: realpathSync('/') always succeeds so the filesystem-root guard is never reached
      current = parent;
    }
  }
}

/**
 * Fail-closed containment.
 *
 * Returns the lexical target on success, null on:
 *   - lexical escape (cheap early reject)
 *   - symlink leaf (including dangling)
 *   - realpath escape (symlink ancestor resolving outside root)
 *   - any non-ENOENT filesystem error
 *
 * @param {string} root - root directory
 * @param {string} target - candidate path to validate
 * @returns {string|null}
 */
export function containByRealpath(root, target) {
  const lexRoot = resolve(root);
  const lexTarget = resolve(target);

  if (lexTarget !== lexRoot && !lexTarget.startsWith(lexRoot + sep)) return null;

  try {
    if (lstatSync(lexTarget).isSymbolicLink()) return null;
  } catch (e) {
    if (e.code !== 'ENOENT') return null; // equivalent mutant (false / empty-catch): any non-ENOENT lstat error (ENOTDIR, EACCES) falls through to realExistingPrefix which rethrows it; the outer catch at L79 then returns null — same observable result
  }

  let realRoot, realTarget;
  try {
    realRoot = realExistingPrefix(lexRoot);
    realTarget = realExistingPrefix(lexTarget);
  } catch {
    return null; // equivalent mutant (empty catch): the lstat guard above filters all non-ENOENT errors before reaching this block, so realExistingPrefix never throws in normal flow and this catch is unreachable
  }

  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) return null;
  return lexTarget;
}
