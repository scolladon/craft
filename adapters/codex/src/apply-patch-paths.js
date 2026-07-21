/**
 * `apply_patch` is Codex's freeform Lark-grammar write tool: the payload is
 * raw patch text, not a structured `file_path` argument. Every path a hunk
 * touches has to be pulled out of that text before any containment check can
 * run against it.
 */

/**
 * Directive prefixes that carry a path. `*** Move to:` names a write
 * destination, not metadata — a rename that escapes the worktree is exactly
 * as dangerous as a write that does, so its target is extracted the same as
 * every other path.
 */
export const PATCH_PATH_DIRECTIVES = Object.freeze([
  '*** Add File:',
  '*** Update File:',
  '*** Delete File:',
  '*** Move to:',
]);

function directivePrefixOf(line) {
  const trimmed = line.trimStart();
  return PATCH_PATH_DIRECTIVES.find((prefix) => trimmed.startsWith(prefix)) ?? null;
}

/**
 * Extract every filename a patch body touches, in document order.
 *
 * why: over-extraction is safe, under-extraction is the hazard. A single
 * patch may carry many hunks touching many files — checking only the first
 * directive line reproduces the decoy hazard in a new shape, where an
 * in-tree leading hunk masks an out-of-tree later one. If an ordinary
 * content line happens to look like a directive, extracting it too only adds
 * a path to the containment check set, which can only make the guard
 * stricter. There is no cleverness here to suppress a look-alike line — a
 * suppression rule is a bypass primitive.
 *
 * @param {string} patchText
 * @returns {string[]} every path named by any directive, in document order
 */
export function extractPatchPaths(patchText) {
  if (typeof patchText !== 'string') {
    return [];
  }

  const paths = [];
  for (const line of patchText.split(/\r?\n/)) {
    const prefix = directivePrefixOf(line);
    if (prefix === null) {
      continue;
    }

    paths.push(line.trimStart().slice(prefix.length).trim());
  }

  return paths;
}
