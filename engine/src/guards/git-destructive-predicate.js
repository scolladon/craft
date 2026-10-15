import { configChannelReason, gitInvocations } from './shell-git-invocations.js';

const REASONS = Object.freeze({
  push: 'craft: destructive git (push) is denied in this binding — run it outside the agent',
  reset: 'craft: destructive git (reset --hard) is denied in this binding — run it outside the agent',
  branch: 'craft: destructive git (forced branch delete) is denied in this binding — run it outside the agent',
  clean: 'craft: destructive git (clean without --dry-run) is denied in this binding — run it outside the agent',
});

const REASON_DYNAMIC_SUBCOMMAND =
  'craft: an expansion sits where git expects an option or the subcommand — spell it out; denied fail-closed in this binding';

const OPTION_TERMINATOR = '--';

const optionWords = args => {
  const end = args.indexOf(OPTION_TERMINATOR);
  return end === -1 ? args : args.slice(0, end);
};

const SHORT_CLUSTER = /^-[A-Za-z]+$/;

const shortClusterHolds = (word, letter) => SHORT_CLUSTER.test(word) && word.includes(letter);

const judgePush = () => REASONS.push;

const judgeReset = invocation => {
  const hard = optionWords(invocation.args).includes('--hard');
  return hard || invocation.dynamicArgCount > 0 ? REASONS.reset : null;
};

const isDryRun = word => word === '--dry-run' || shortClusterHolds(word, 'n');

const judgeClean = invocation => (optionWords(invocation.args).some(isDryRun) ? null : REASONS.clean);

const holdsShort = (words, letter) => words.some(word => shortClusterHolds(word, letter));

const holdsLong = (words, name) => words.includes(name);

const judgeBranch = invocation => {
  const words = optionWords(invocation.args);
  const deletes = holdsShort(words, 'd') || holdsLong(words, '--delete');
  const forces = holdsShort(words, 'f') || holdsLong(words, '--force');
  const blocked = holdsShort(words, 'D') || (deletes && forces) || invocation.dynamicArgCount > 0;
  return blocked ? REASONS.branch : null;
};

const JUDGES = new Map([
  ['push', judgePush],
  ['reset', judgeReset],
  ['clean', judgeClean],
  ['branch', judgeBranch],
]);

const judgeSubcommand = invocation => JUDGES.get(invocation.subcommand)?.(invocation) ?? null;

const SNIFFED_VERBS = Object.freeze(['push', 'reset', 'clean', 'branch']);

const sniffRest = rest => {
  const verb = SNIFFED_VERBS.find(candidate => rest.includes(candidate));
  return verb === undefined ? null : REASONS[verb];
};

const judgeByKind = invocation => {
  if (invocation.kind === 'subcommand') return judgeSubcommand(invocation);
  if (invocation.kind === 'indeterminate') return REASON_DYNAMIC_SUBCOMMAND;
  if (invocation.kind === 'refused') return sniffRest(invocation.rest);
  return null;
};

const verdictFor = invocation => configChannelReason(invocation) ?? judgeByKind(invocation);

/**
 * Pure predicate: does this bash command run a destructive git verb?
 *
 * @param {string} command
 * @returns {{ block: boolean, reason?: string }}
 */
export function gitDestructivePredicate(command) {
  const result = gitInvocations(command);
  if (!result.parsed) return { block: true, reason: result.reason };
  for (const invocation of result.invocations) {
    const reason = verdictFor(invocation);
    if (reason !== null) return { block: true, reason };
  }
  return { block: false };
}
