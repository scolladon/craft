import { configChannelReason, judgeInvocations } from './shell-git-invocations.js';
import { DIFFING_VERBS, EXT_DIFF_WORD, optionWords } from './git-argv.js';

// Patterns that make a git diff/show invocation exempt from the ext-diff check.
export const COMPLIANT_MARKERS = ['--no-ext-diff', 'rtk proxy'];

// Internal to this module (the predicate below returns it); no external consumer
// re-exports it — the opencode surface deliberately keeps it private too.
const REASON_GIT_EXT_DIFF =
  'git diff/show must carry --no-ext-diff (external diff mangles parsed output)';

const REASON_EXT_DIFF_OPTION = '--ext-diff is denied on every git verb (external diff mangles parsed output)';

const [NO_EXT_DIFF_WORD, PROXY_MARKER] = COMPLIANT_MARKERS;
const PROXY_WORDS = Object.freeze(PROXY_MARKER.split(' '));
const DIFFING_SUBCOMMANDS = new Set(DIFFING_VERBS);

const isExtDiffSetting = word => word === EXT_DIFF_WORD || word === NO_EXT_DIFF_WORD;
const lacksNoExtDiff = words => optionWords(words).findLast(isExtDiffSetting) !== NO_EXT_DIFF_WORD;

// mentionsExtDiff keeps this cheap: an invocation whose command has no such word never reads its arguments.
const enablesExtDiff = invocation =>
  invocation.kind === 'subcommand' &&
  // equivalent mutant (ConditionalExpression true for mentionsExtDiff === true): the arguments are the command's own words, so an --ext-diff argument implies the flag; it only spares the argument read
  invocation.mentionsExtDiff === true &&
  optionWords(invocation.args).findLast(isExtDiffSetting) === EXT_DIFF_WORD;

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

const optionReasonFor = invocation => {
  if (diffsWithoutMarker(invocation)) return REASON_GIT_EXT_DIFF;
  return enablesExtDiff(invocation) ? REASON_EXT_DIFF_OPTION : null;
};

export const extDiffVerdictFor = invocation => {
  const reason = configChannelReason(invocation);
  if (reason !== null) return reason;
  const rejected = optionReasonFor(invocation);
  // equivalent mutant (ConditionalExpression true for rejected !== null): a null rejection yields null on either branch
  return rejected !== null && !isProxied(invocation.leadingWords) ? rejected : null;
};

/**
 * Pure predicate: does this bash command run git diff/show without --no-ext-diff, or pass --ext-diff to any git verb?
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
