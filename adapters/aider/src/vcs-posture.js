/**
 * First-class VCS commit posture for the `aider` subprocess.
 *
 * `--auto-commits` keeps Aider's own commit (the handoff); `--no-dirty-commits` gives a
 * deterministic one-commit-per-turn artifact; the three `--no-attribute-*` flags keep
 * commits one-line-conventional (no co-author/attribution trailers).
 */
const FLAG_AUTO_COMMITS = '--auto-commits';
const FLAG_NO_DIRTY_COMMITS = '--no-dirty-commits';
const FLAG_NO_ATTRIBUTE_AUTHOR = '--no-attribute-author';
const FLAG_NO_ATTRIBUTE_COMMITTER = '--no-attribute-committer';
const FLAG_NO_ATTRIBUTE_CO_AUTHORED_BY = '--no-attribute-co-authored-by';

const ACTION_ACCEPT = 'accept';
const ACTION_RESET = 'reset';
const GREEN_OUTCOME = 'green';

/**
 * Build the VCS posture argv for an `aider` subprocess invocation.
 *
 * @returns {string[]} a fresh array each call (immutable-by-default; no shared mutable state)
 */
export function buildVcsPostureArgs() {
  return [
    FLAG_AUTO_COMMITS,
    FLAG_NO_DIRTY_COMMITS,
    FLAG_NO_ATTRIBUTE_AUTHOR,
    FLAG_NO_ATTRIBUTE_COMMITTER,
    FLAG_NO_ATTRIBUTE_CO_AUTHORED_BY,
  ];
}

/**
 * A reset with no target is a caller error — fail loud, never a silent no-target reset.
 * @param {unknown} preTurnHead
 */
function assertResetTarget(preTurnHead) {
  if (typeof preTurnHead !== 'string' || preTurnHead === '') {
    throw new Error('reconcileGateOutcome: preTurnHead must be a non-empty string to reset');
  }
}

/**
 * Decide what to do with Aider's auto-commit after a turn's quality gate ran.
 *
 * PURE query — no side effects, no logging. The actual `git reset` is
 * runner/orchestrator behaviour, out of this module's scope.
 *
 * @param {{ gateOutcome: string, preTurnHead: string }} opts
 * @returns {{ action: 'accept' } | { action: 'reset', target: string }}
 */
export function reconcileGateOutcome({ gateOutcome, preTurnHead }) {
  if (gateOutcome === GREEN_OUTCOME) {
    return { action: ACTION_ACCEPT };
  }

  assertResetTarget(preTurnHead);
  return { action: ACTION_RESET, target: preTurnHead };
}
