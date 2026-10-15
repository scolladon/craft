import { configChannelReason, judgeInvocations } from './shell-git-invocations.js';
import { DESTRUCTIVE_VERBS, optionWords } from './git-argv.js';

const REASONS = Object.freeze({
  push: 'craft: destructive git (push) is denied in this binding — run it outside the agent',
  reset: 'craft: destructive git (reset --hard) is denied in this binding — run it outside the agent',
  branch: 'craft: destructive git (forced branch delete) is denied in this binding — run it outside the agent',
  clean: 'craft: destructive git (clean without --dry-run) is denied in this binding — run it outside the agent',
});

const REASON_DYNAMIC_SUBCOMMAND =
  'craft: an expansion sits where git expects an option or the subcommand — spell it out; denied fail-closed in this binding';

const HARD = '--hard';
const DRY_RUN = '--dry-run';
const NO_DRY_RUN = '--no-dry-run';
const DELETE = '--delete';
const FORCE = '--force';
const EXCLUDE = '--exclude';
const DRY_RUN_SHORT = 'n';
const DELETE_SHORT = 'd';
const FORCE_SHORT = 'f';
const FORCE_DELETE_SHORT = 'D';
const EXCLUDE_SHORT = 'e';

// git accepts any unambiguous prefix of a long option; each floor is the shortest prefix
// counted. A guarded option is matched from "--" plus one character (fail closed); a
// dry-run is only recognised from the prefix git itself resolves ("--dry", "--no-d").
const GUARDED_MIN_LENGTH = 3;
const DRY_RUN_MIN_LENGTH = '--dry'.length;
const NO_DRY_RUN_MIN_LENGTH = '--no-d'.length;

const SHORT_CLUSTER = /^-[^-]/;
const LONG_OPTION = /^--[^=]*$/;

const abbreviates = (word, option, minLength = GUARDED_MIN_LENGTH) =>
  LONG_OPTION.test(word) && word.length >= minLength && option.startsWith(word);

const shortLetters = word => (SHORT_CLUSTER.test(word) ? word.slice(1) : '');

const shortClusterHolds = (word, letter) => /^-[A-Za-z]+$/.test(word) && word.includes(letter);

const judgePush = () => REASONS.push;

const judgeReset = invocation => {
  const hard = optionWords(invocation.args).some(word => abbreviates(word, HARD));
  return hard || invocation.dynamicArgCount > 0 ? REASONS.reset : null;
};

const afterWord = (state, word) => {
  if (state.skipNext) return { ...state, skipNext: false };
  if (abbreviates(word, NO_DRY_RUN, NO_DRY_RUN_MIN_LENGTH)) return { ...state, dry: false };
  if (abbreviates(word, DRY_RUN, DRY_RUN_MIN_LENGTH)) return { ...state, dry: true };
  if (abbreviates(word, EXCLUDE)) return { ...state, skipNext: true };
  return afterCluster(state, shortLetters(word));
};

const afterCluster = (state, letters) => {
  const valueAt = letters.indexOf(EXCLUDE_SHORT);
  const flags = valueAt === -1 ? letters : letters.slice(0, valueAt);
  const dry = flags.includes(DRY_RUN_SHORT) ? true : state.dry;
  const skipNext = valueAt !== -1 && valueAt === letters.length - 1;
  return { dry, skipNext };
};

const INITIAL_CLEAN_STATE = Object.freeze({ dry: false, skipNext: false });

const judgeClean = invocation => {
  const { dry } = optionWords(invocation.args).reduce(afterWord, INITIAL_CLEAN_STATE);
  return dry && invocation.dynamicArgCount === 0 ? null : REASONS.clean;
};

const holdsShort = (words, letter) => words.some(word => shortClusterHolds(word, letter));

const holdsLong = (words, name) => words.some(word => abbreviates(word, name));

const judgeBranch = invocation => {
  const words = optionWords(invocation.args);
  const deletes = holdsShort(words, DELETE_SHORT) || holdsLong(words, DELETE);
  const forces = holdsShort(words, FORCE_SHORT) || holdsLong(words, FORCE);
  const blocked = holdsShort(words, FORCE_DELETE_SHORT) || (deletes && forces) || invocation.dynamicArgCount > 0;
  return blocked ? REASONS.branch : null;
};

const JUDGES = new Map([
  ['push', judgePush],
  ['reset', judgeReset],
  ['clean', judgeClean],
  ['branch', judgeBranch],
]);

const judgeSubcommand = invocation => JUDGES.get(invocation.subcommand)?.(invocation) ?? null;

const sniffRest = rest => {
  const verb = DESTRUCTIVE_VERBS.find(candidate => rest.includes(candidate));
  return verb === undefined ? null : REASONS[verb];
};

const judgeByKind = invocation => {
  if (invocation.kind === 'subcommand') return judgeSubcommand(invocation);
  if (invocation.kind === 'indeterminate') return REASON_DYNAMIC_SUBCOMMAND;
  if (invocation.kind === 'refused') return sniffRest(invocation.rest);
  return null;
};

export const destructiveVerdictFor = invocation => configChannelReason(invocation) ?? judgeByKind(invocation);

/**
 * Pure predicate: does this bash command run a destructive git verb?
 *
 * @param {string} command
 * @returns {{ block: boolean, reason?: string }}
 */
export function gitDestructivePredicate(command) {
  return judgeInvocations(command, destructiveVerdictFor);
}
