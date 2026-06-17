/**
 * Manifest frontmatter handling — the single home both manifest bins share, so
 * `manifest-lint` and `pipeline-resolve` read a `.claude/workflow.md` identically.
 */

import { load } from 'js-yaml';

/**
 * Extract the YAML frontmatter block between the first and second `---` fences.
 * Returns null when no such block exists (fence-less, or an empty block).
 *
 *   awk '/^---$/{n++; next} n==1{print} n>=2{exit}'
 *
 * `line.trim()` tolerates a trailing CR (CRLF files) and trailing spaces on a fence.
 *
 * @param {string} content
 * @returns {string|null}
 */
export function extractFrontmatter(content) {
  const lines = content.split('\n');
  const collected = [];
  let delimCount = 0;

  for (const line of lines) {
    if (line.trim() === '---') {
      delimCount += 1;
      if (delimCount >= 2) break;
      continue;
    }
    if (delimCount === 1) collected.push(line.replace(/\r$/, ''));
  }

  if (delimCount === 0 || collected.length === 0) return null;
  return collected.join('\n');
}

/**
 * Parse a manifest file's content into a manifest object (or null for no config).
 *
 * A real `.claude/workflow.md` is **fenced** (YAML frontmatter + markdown body): the
 * body never reaches the YAML parser, and an empty/absent block resolves to no config
 * (defaults) rather than a parse error on the prose. A **fence-less** file (a bare
 * scenario fixture) is pure YAML parsed whole. The fence/no-fence decision keys on
 * whether the content opens with a `---` fence — so the prose body of a fenced file is
 * never mistaken for the manifest.
 *
 * @param {string} content
 * @returns {object|null}
 */
export function parseManifestContent(content) {
  const isFenced = content.trimStart().startsWith('---');
  const yamlText = isFenced ? (extractFrontmatter(content) ?? '') : content;
  return load(yamlText) ?? null;
}
