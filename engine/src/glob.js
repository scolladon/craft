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

/**
 * Representative repo-relative paths a whole-tree exemption would have to match:
 * a root file, a root file with no extension, a nested source, a nested doc,
 * and a deep path.
 */
export const PROBE_PATHS = Object.freeze([
  'README.md',
  'Makefile',
  'engine/src/adr-lint-main.js',
  'docs/contributing/adr/001-example.md',
  'a/b/c/d/e.txt',
]);

/**
 * True when a glob matches every representative path — i.e. it exempts the
 * whole tree. Tested by SEMANTICS, not by spelling: brace-alternation and
 * question-mark forms match everything while carrying a non-wildcard segment,
 * so a spelling-based check bounds one form at a time and leaves the rest open.
 * @param {string} glob
 * @returns {boolean}
 */
export function matchesEveryPath(glob) {
  return PROBE_PATHS.every((candidate) => matchGlob(candidate, glob));
}
