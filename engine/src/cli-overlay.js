/**
 * CLI overlay — merges per-invocation CLI flags into a manifest.
 * Pure; immutable; no file I/O.
 */

/**
 * Union-extend an existing skip array with new ids, preserving order and de-duplicating.
 * Existing entries come first; only new-not-already-present entries are appended.
 *
 * @param {string[]} existing
 * @param {string[]} incoming
 * @returns {string[]}
 */
function unionSkip(existing, incoming) {
  const seen = new Set(existing);
  const additions = incoming.filter(id => !seen.has(id));
  return [...existing, ...additions];
}

/**
 * Apply CLI flag overlay onto a manifest, returning a new merged manifest.
 * The input is never mutated: the returned top-level object and its `pipeline`
 * are always freshly constructed; the `skip` array is rebuilt only when a skip
 * overlay applies.
 *
 * - `profile` (string|undefined): if present, sets `merged.pipeline.profile`.
 * - `skip` (string[]|undefined): if present and non-empty, union-extends
 *   `merged.pipeline.skip` (existing first, then new-not-already-present).
 * - empty/absent overlay → returns an equivalent manifest (a fresh top-level
 *   object; `pipeline` cloned when present so the shape is preserved exactly).
 *
 * @param {object} manifest
 * @param {{ profile?: string, skip?: string[] }} overlay
 * @returns {object}
 */
export function applyCliOverlay(manifest, { profile, skip } = {}) {
  const hasProfile = profile !== undefined;
  const hasSkip = Array.isArray(skip) && skip.length > 0;

  if (!hasProfile && !hasSkip) {
    return manifest.pipeline
      ? { ...manifest, pipeline: { ...manifest.pipeline } }
      : { ...manifest };
  }

  const existingPipeline = manifest.pipeline ?? {};
  const existingSkip = existingPipeline.skip ?? [];

  const mergedPipeline = {
    ...existingPipeline,
    ...(hasProfile ? { profile } : {}),
    ...(hasSkip ? { skip: unionSkip(existingSkip, skip) } : {}),
  };

  return { ...manifest, pipeline: mergedPipeline };
}
