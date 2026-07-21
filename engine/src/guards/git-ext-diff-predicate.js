// Patterns that make a bash command exempt from the git ext-diff check.
export const COMPLIANT_MARKERS = ['--no-ext-diff', 'rtk proxy'];

// Regex mirroring hooks/git-no-ext-diff.sh: matches git diff/show invocations,
// allowing global options (-C, -c, --git-dir=, --work-tree=) between git and the subcommand.
// Does NOT match `git stash show`, `git show-ref`, `git difftool`.
export const GIT_DIFF_SHOW_RE =
  /(^|[;&|]\s*)git(\s+(-C\s+\S+|-c\s+\S+|--git-dir=\S+|--work-tree=\S+))*\s+(diff|show)(\s|$)/;

// Internal to this module (the predicate below returns it); no external consumer
// re-exports it — the opencode surface deliberately keeps it private too.
const REASON_GIT_EXT_DIFF =
  'git diff/show must carry --no-ext-diff (external diff mangles parsed output)';

/**
 * Pure predicate: does this bash command need to be blocked for missing --no-ext-diff?
 *
 * @param {string} command
 * @returns {{ block: boolean, reason?: string }}
 */
export function gitExtDiffPredicate(command) {
  if (COMPLIANT_MARKERS.some((marker) => command.includes(marker))) {
    return { block: false };
  }

  if (!GIT_DIFF_SHOW_RE.test(command)) {
    return { block: false };
  }

  return { block: true, reason: REASON_GIT_EXT_DIFF };
}
