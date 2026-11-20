/**
 * Glob matching — the single `node:path` `matchesGlob` call site. Isolated behind
 * one internal helper so an experimental-API churn is a single-site swap.
 */

import { matchesGlob } from 'node:path';

/**
 * Match a repo-relative path against a glob pattern.
 * Never throws — any input the underlying matcher rejects (including a non-match) is `false`.
 *
 * @param {string} path
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchGlob(path, pattern) {
  try {
    return matchesGlob(path, pattern);
  } catch {
    return false;
  }
}

/**
 * Whether two path globs can match a common path — a directory-prefix overlap test used
 * by the coverage check. Each glob reduces to its literal prefix (up to the first
 * wildcard); the globs overlap when one prefix contains the other. Deliberately
 * permissive over directory-scoped globs so a coverage check never raises a false
 * "uncovered" when a page's subjects plausibly govern part of the scope. Authors write
 * covers/subjects as directory-scoped globs (`dir/**`, `dir/*.ext`).
 */
export function globsOverlap(a, b) {
  const pa = literalPrefix(a);
  const pb = literalPrefix(b);
  return prefixContains(pa, pb) || prefixContains(pb, pa);
}

function prefixContains(outer, inner) {
  if (outer === inner) return true;
  const boundary = outer.endsWith('/') ? outer : `${outer}/`;
  return inner.startsWith(boundary);
}

function literalPrefix(glob) {
  const wildcard = glob.search(/[*?[{]/);
  return wildcard === -1 ? glob : glob.slice(0, wildcard);
}
