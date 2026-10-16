// Well under copilot's ~30 s hook timeout (past which the hook fails open), far
// above the ~70 ms cold verdict.
export const DEFAULT_VERDICT_DEADLINE_MS = 5000;

/**
 * An override may only shorten the deadline, so tests stay fast and production
 * cannot be configured into failing open.
 * @param {string|undefined} override
 * @returns {number}
 */
export function resolveDeadlineMs(override) {
  const requested = Number(override);
  if (!Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_VERDICT_DEADLINE_MS;
  }
  return Math.min(requested, DEFAULT_VERDICT_DEADLINE_MS);
}
