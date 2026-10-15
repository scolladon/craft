import { gitInvocations, hasInlineAlias, INLINE_ALIAS_REASON } from './shell-git-invocations.js';

// Patterns that make a git diff/show invocation exempt from the ext-diff check.
export const COMPLIANT_MARKERS = ['--no-ext-diff', 'rtk proxy'];

// Internal to this module (the predicate below returns it); no external consumer
// re-exports it — the opencode surface deliberately keeps it private too.
const REASON_GIT_EXT_DIFF =
  'git diff/show must carry --no-ext-diff (external diff mangles parsed output)';

const [NO_EXT_DIFF_WORD, PROXY_MARKER] = COMPLIANT_MARKERS;
const PROXY_WORDS = Object.freeze(PROXY_MARKER.split(' '));
const DIFFING_SUBCOMMANDS = Object.freeze(new Set(['diff', 'show']));

const lacksNoExtDiff = words => !words.includes(NO_EXT_DIFF_WORD);

const isProxied = leadingWords => PROXY_WORDS.every((word, index) => leadingWords[index] === word);

const diffsWithoutMarker = invocation => {
  if (invocation.kind === 'subcommand') {
    return DIFFING_SUBCOMMANDS.has(invocation.subcommand) && lacksNoExtDiff(invocation.args);
  }
  if (invocation.kind === 'indeterminate') {
    return lacksNoExtDiff(invocation.rest);
  }
  return false;
};

const verdictFor = invocation => {
  if (hasInlineAlias(invocation)) return INLINE_ALIAS_REASON;
  if (diffsWithoutMarker(invocation) && !isProxied(invocation.leadingWords)) return REASON_GIT_EXT_DIFF;
  return null;
};

/**
 * Pure predicate: does this bash command run git diff/show without --no-ext-diff?
 *
 * The command is parsed into simple commands and each git invocation is judged on its
 * normalised form, so shell grammar and git global options cannot hide a diff/show.
 *
 * @param {string} command
 * @returns {{ block: boolean, reason?: string }}
 */
export function gitExtDiffPredicate(command) {
  const result = gitInvocations(command);
  if (!result.parsed) return { block: true, reason: result.reason };
  for (const invocation of result.invocations) {
    const reason = verdictFor(invocation);
    if (reason !== null) return { block: true, reason };
  }
  return { block: false };
}
