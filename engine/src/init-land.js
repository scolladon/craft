/**
 * Deterministic lint-then-move land step.
 * Pure core — no direct I/O. All side-effects are injected via deps.
 *
 * Atomicity guarantee: if lint exits non-zero, rename is never called and
 * the final path is never written. If rename throws, the error is surfaced
 * as a failure value — never swallowed, never left as a half-move.
 */

/**
 * @typedef {{ exitCode: number, errors: string[] }} LintResult
 * @typedef {{ lint: (path: string) => LintResult, rename: (from: string, to: string) => void }} Deps
 */

/**
 * Run the lint-then-rename sequence.
 *
 * @param {{ tmpPath: string, finalPath: string }} paths
 * @param {Deps} deps
 * @returns {{ ok: true, path: string } | { ok: false, errors: string[] }}
 */
export function land({ tmpPath, finalPath }, deps) {
  const lintResult = deps.lint(tmpPath);

  if (lintResult.exitCode !== 0) {
    return { ok: false, errors: lintResult.errors };
  }

  try {
    deps.rename(tmpPath, finalPath);
  } catch (err) {
    return { ok: false, errors: [`land: rename failed: ${err.message}`] };
  }

  return { ok: true, path: finalPath };
}
