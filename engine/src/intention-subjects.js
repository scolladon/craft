/**
 * `subjects` frontmatter parser — the file adapter's and the lint's shared primitive.
 * Pure — no I/O. Mirrors `dod.js` `parseDod`.
 * Never throws on absence; throws only on a present-but-malformed frontmatter block.
 */

import { extractFrontmatter } from './frontmatter.js';
import { load } from 'js-yaml';

/**
 * Parse a living page's `subjects` declaration from its frontmatter.
 *
 * - No frontmatter block → null (advisory skip).
 * - Frontmatter without a `subjects` key → null (skip).
 * - Frontmatter present but malformed YAML → throws (author error, surfaced loud).
 * - Valid → returns the raw `subjects` value (shape validation is the caller's concern).
 *
 * @param {string} content
 * @returns {unknown | null}
 * @throws {Error} when a present frontmatter block is not valid YAML
 */
export function parseSubjects(content) {
  const block = extractFrontmatter(content);
  if (block === null) return null; // equivalent mutant (false): js-yaml load(null) returns null; L33 !parsed catches it → same return null

  let parsed;
  try {
    parsed = load(block);
  } catch (e) {
    throw new Error(`intention: malformed YAML frontmatter — ${e.message}`);
  }

  // equivalent mutant (remove typeof check): primitives have no 'subjects' own property so !hasOwn catches them too
  if (!parsed || typeof parsed !== 'object' || !Object.hasOwn(parsed, 'subjects')) return null;
  return parsed.subjects;
}
