import { configChannelReason, judgeInvocations } from './shell-git-invocations.js';
import { DIFFING_VERBS, optionWords } from './git-argv.js';

// Patterns that make a git diff/show invocation exempt from the ext-diff check.
export const COMPLIANT_MARKERS = ['--no-ext-diff', 'rtk proxy'];

// Internal to this module (the predicate below returns it); no external consumer
// re-exports it — the opencode surface deliberately keeps it private too.
const REASON_GIT_EXT_DIFF =
  'git diff/show must carry --no-ext-diff (external diff mangles parsed output)';

const [NO_EXT_DIFF_WORD, PROXY_MARKER] = COMPLIANT_MARKERS;
const PROXY_WORDS = Object.freeze(PROXY_MARKER.split(' '));
const DIFFING_SUBCOMMANDS = new Set(DIFFING_VERBS);

const EXT_DIFF_WORD = '--ext-diff';
const lacksNoExtDiff = words => {
  const last = optionWords(words).findLast(word => word === EXT_DIFF_WORD || word === NO_EXT_DIFF_WORD);
  return last !== NO_EXT_DIFF_WORD;
};

// A dynamic option word after the last --no-ext-diff may expand to --ext-diff.
const dynamicAfterNoExtDiff = invocation => {
  const lastMarker = optionWords(invocation.args).lastIndexOf(NO_EXT_DIFF_WORD);
  return invocation.dynamicArgPositions.some(position => position > lastMarker);
};

const isProxied = leadingWords => PROXY_WORDS.every((word, index) => leadingWords[index] === word);

const diffsWithoutMarker = invocation => {
  if (invocation.kind === 'subcommand') {
    return (
      DIFFING_SUBCOMMANDS.has(invocation.subcommand) &&
      (lacksNoExtDiff(invocation.args) || dynamicAfterNoExtDiff(invocation))
    );
  }
  if (invocation.kind === 'indeterminate') {
    return lacksNoExtDiff(invocation.rest);
  }
  return false;
};

export const extDiffVerdictFor = invocation => {
  const reason = configChannelReason(invocation);
  if (reason !== null) return reason;
  return diffsWithoutMarker(invocation) && !isProxied(invocation.leadingWords) ? REASON_GIT_EXT_DIFF : null;
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
  return judgeInvocations(command, extDiffVerdictFor);
}
