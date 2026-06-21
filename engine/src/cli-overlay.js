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
 * Deep-merge a list of harness overlay entries into the manifest phases map.
 * Returns a new phases object; never mutates the input.
 *
 * @param {Record<string, unknown>} existingPhases
 * @param {Array<{ phase: string, knob: string, value: unknown }>} entries
 * @returns {Record<string, unknown>}
 */
function mergeHarnessOverlay(existingPhases, entries) {
  const phases = { ...existingPhases };
  for (const { phase, knob, value } of entries) {
    const existing = phases[phase] ?? {};
    const existingHarness = existing.harness ?? {};
    phases[phase] = { ...existing, harness: { ...existingHarness, [knob]: value } };
  }
  return phases;
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
 * - `harness` (Array<{phase,knob,value}>|undefined): if present and non-empty,
 *   deep-merges each entry into `merged.phases.<phase>.harness.<knob>`.
 * - empty/absent overlay → returns an equivalent manifest (a fresh top-level
 *   object; `pipeline` cloned when present so the shape is preserved exactly).
 *
 * @param {object} manifest
 * @param {{ profile?: string, skip?: string[], harness?: Array<{phase: string, knob: string, value: unknown}> }} overlay
 * @returns {object}
 */
export function applyCliOverlay(manifest, { profile, skip, harness } = {}) {
  const hasProfile = profile !== undefined;
  const hasSkip = Array.isArray(skip) && skip.length > 0;
  const hasHarness = Array.isArray(harness) && harness.length > 0;

  if (!hasProfile && !hasSkip && !hasHarness) {
    return manifest.pipeline
      ? { ...manifest, pipeline: { ...manifest.pipeline } }
      : { ...manifest };
  }

  const base = { ...manifest };

  if (hasHarness) {
    base.phases = mergeHarnessOverlay(manifest.phases ?? {}, harness);
  }

  if (!hasProfile && !hasSkip) {
    return base;
  }

  const existingPipeline = manifest.pipeline ?? {};
  const existingSkip = existingPipeline.skip ?? [];

  const mergedPipeline = {
    ...existingPipeline,
    ...(hasProfile ? { profile } : {}),
    ...(hasSkip ? { skip: unionSkip(existingSkip, skip) } : {}),
  };

  return { ...base, pipeline: mergedPipeline };
}
