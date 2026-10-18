import { DESTRUCTIVE_VERBS, DIFFING_VERBS, extend, indeterminate, normaliseFrom, subcommandResult, NO_SUBCOMMAND, texts, toWord, VALUE_SEPARATOR, walkFrom } from './git-argv.js';
import { basename, parseShellCommands } from './shell-tokeniser.js';

const GIT_COMMAND = 'git';
const PATH_SEPARATOR = '/';
const ALIAS_KEY_PREFIX = 'alias.';

export const INLINE_ALIAS_REASON =
  'craft: an inline git alias (-c alias.*) is denied — it can run any git verb';

// zsh expands a word that opens with `=` to the path of the command it names, so `=git` runs git.
const ZSH_EQUALS_PREFIX = /^=/;

const isGitWord = word => !word.dynamic && basename(word.text.replace(ZSH_EQUALS_PREFIX, '')).toLowerCase() === GIT_COMMAND;

// Judges read only the words that open the command (a proxy prefix), so the copy stays bounded
// however far into a long command the git word sits.
const LEADING_WORDS_LIMIT = 2;

const leadingOf = (words, index) => texts(words.slice(0, Math.min(index, LEADING_WORDS_LIMIT)));

const anchoredAt = (words, index) => {
  const { invocation, end } = walkFrom(words, index + 1);
  return { anchor: extend(invocation, { leadingWords: () => leadingOf(words, index) }), end };
};

const dynamicHeadInvocation = words => extend(normaliseFrom(words, 1), { leadingWords: () => [] });

const ANCHOR_VERBS = new Set([...DESTRUCTIVE_VERBS, ...DIFFING_VERBS]);
// equivalent mutant (Regex without +): a delimiter run only splits into extra empty tokens, and '' is never in ANCHOR_VERBS
const PATTERN_DELIMITERS = /[{},[\]]+/;

const holdsAnchorVerb = ({ text }) => text.split(PATTERN_DELIMITERS).some(token => ANCHOR_VERBS.has(token));

const indeterminateAt = (words, index) =>
  extend(indeterminate(words, index + 1), { leadingWords: () => leadingOf(words, index) });

const patternAnchors = (words, flag) =>
  words.flatMap((word, index) =>
    word.pattern === true && holdsAnchorVerb(word) ? [flag(indeterminateAt(words, index), index)] : []
  );

const DASHED_VERB = /^git-([a-z][a-z-]*)$/i;

const dashedVerb = word => {
    // equivalent mutant (OptionalChaining ?.[1].toLowerCase): a null exec short-circuits the whole chain to undefined, and a match always has group 1
  const verb = DASHED_VERB.exec(basename(word.text))?.[1]?.toLowerCase() ?? null;
  const spelledOut = !word.dynamic || word.text.includes(PATH_SEPARATOR);
  return spelledOut ? verb : null;
};

const dashedAt = (words, index, verb) =>
  extend(subcommandResult(verb, words, index + 1, []), { leadingWords: () => leadingOf(words, index) });

const isAnchorVerb = word => !word.dynamic && ANCHOR_VERBS.has(word.text);

const isGitSpelling = word => isGitWord(word) || dashedVerb(word) !== null;

// A dynamic word ahead of a verb word may be the git itself behind a wrapper (command $G push).
// Once a literal git word precedes it, the dynamic word is that invocation's own argument.
const wrapperAnchors = (words, flag) => {
  const dynamicAt = words.findIndex((word, index) => index > 0 && word.dynamic);
  if (dynamicAt === -1 || words.slice(0, dynamicAt).some(isGitSpelling)) return [];
  const verbAfter = words.slice(dynamicAt + 1).some(isAnchorVerb);
  return verbAfter ? [flag(indeterminateAt(words, dynamicAt), dynamicAt)] : [];
};

const NO_ANCHOR = Object.freeze({ anchor: null, end: 0 });

const spelledAnchor = (words, index) => {
  if (isGitWord(words[index])) return anchoredAt(words, index);
  const verb = dashedVerb(words[index]);
  return verb === null ? NO_ANCHOR : { anchor: dashedAt(words, index, verb), end: 0 };
};

// A git word inside an earlier anchor's option run is that option's value, never a command,
// so skipping it keeps a chain of `git -c git -c git …` from being walked once per git word.
const spelledAnchors = (words, flag) => {
  const anchors = [];
  let consumedUntil = 0;
  for (let index = 0; index < words.length; index += 1) {
    if (index < consumedUntil) continue;
    const { anchor, end } = spelledAnchor(words, index);
    if (anchor === null) continue;
    anchors.push(flag(anchor, index));
    consumedUntil = end;
  }
  return anchors;
};

const CONFIG_CHANNEL = /^GIT_CONFIG_(?:PARAMETERS|COUNT|GLOBAL|SYSTEM|KEY_\d+|VALUE_\d+)=/;
const ALIAS_BUILTIN = 'alias';
// equivalent mutant (Regex without +): a whitespace run only splits into extra empty words, and '' is neither git nor a dashed git spelling
const WHITESPACE = /\s+/;

const isConfigChannel = text => CONFIG_CHANNEL.test(text);

// Anchors are flagged once per command (the first channel word and whether the head holds one),
// so flagging stays linear however many git words the command has.
const channelCursor = ({ words, assignments }) => ({
  headInjects: assignments.some(isConfigChannel),
  firstWordAt: words.findIndex(({ text }) => isConfigChannel(text)),
});

const injectsAt = ({ headInjects, firstWordAt }, anchorAt) =>
  headInjects || (firstWordAt !== -1 && firstWordAt < anchorAt);

const flagged = (invocation, injects) => Object.defineProperty(invocation, 'injectsConfig', { value: injects, enumerable: false });

const aliasValueWords = ({ text }) =>
  text.includes(VALUE_SEPARATOR)
    ? text.slice(text.indexOf(VALUE_SEPARATOR) + 1).split(WHITESPACE).map(toWord)
    : [];

const aliasesGit = word => aliasValueWords(word).some(isGitSpelling);

const aliasDefinition = ({ words }) =>
    // equivalent mutant (MethodExpression words for words.slice(1)): words[0].text is 'alias' here and holds no '=', so it never aliases git
  words[0].text === ALIAS_BUILTIN && words.slice(1).some(aliasesGit)
    ? [flagged(extend(NO_SUBCOMMAND, { leadingWords: () => [] }), true)]
    : [];

const flaggerFor = command => {
  const cursor = channelCursor(command);
  return (invocation, index) => flagged(invocation, injectsAt(cursor, index));
};

const anchoredInvocations = command => {
  const { words } = command;
  const flag = flaggerFor(command);
    // equivalent mutant (OptionalChaining words[0].dynamic): the tokeniser never yields a command without words, and aliasDefinition already reads words[0] unguarded
  const head = words[0]?.dynamic === true ? [flag(dynamicHeadInvocation(words), 0)] : [];
  return [
    ...head,
    ...spelledAnchors(words, flag),
    ...patternAnchors(words, flag),
    ...wrapperAnchors(words, flag),
    ...aliasDefinition(command),
  ];
};

const MAX_ARGUMENT_READING_ANCHORS = 256;
const TOO_MANY_INVOCATIONS =
  'craft: command not parseable (too many git invocations) — denied fail-closed';

// A verb the judges inspect hands them every later word, so each such anchor costs a pass over
// the command; capping them bounds the total work.
const readsArguments = invocation =>
  invocation.kind !== 'no-subcommand' && (invocation.kind !== 'subcommand' || ANCHOR_VERBS.has(invocation.subcommand));

const exceedsAnchorCap = invocations =>
  invocations.filter(readsArguments).length > MAX_ARGUMENT_READING_ANCHORS;

export function gitInvocations(command) {
  const result = parseShellCommands(command);
  if (!result.parsed) return result;
  const perCommand = result.commands.map(anchoredInvocations);
  if (perCommand.some(exceedsAnchorCap)) return { parsed: false, reason: TOO_MANY_INVOCATIONS };
  return { parsed: true, invocations: perCommand.flat() };
}

export const CONFIG_CHANNEL_REASON = 'craft: git config injected outside -c is denied in this binding';
const INCLUDE_PATH_KEY = 'include.path';
const INCLUDE_IF_PREFIX = 'includeif.';

const holdsIncludeKey = invocation =>
  invocation.kind === 'subcommand' &&
  invocation.configKeys.some(key => key === INCLUDE_PATH_KEY || key.startsWith(INCLUDE_IF_PREFIX));

export const hasInlineAlias = invocation =>
  invocation.kind === 'subcommand' && invocation.configKeys.some(key => key.startsWith(ALIAS_KEY_PREFIX));

export const configChannelReason = invocation => {
  if (hasInlineAlias(invocation)) return INLINE_ALIAS_REASON;
  return invocation.injectsConfig === true || holdsIncludeKey(invocation) ? CONFIG_CHANNEL_REASON : null;
};

/**
 * Returns the first reason `verdictFor` gives an invocation of an already parsed command;
 * a command that could not be parsed is denied fail-closed with the parser's reason.
 *
 * @param {{ parsed: boolean, reason?: string, invocations?: object[] }} result
 * @param {(invocation: object) => string|null} verdictFor
 * @returns {{ block: boolean, reason?: string }}
 */
export function judgeParsed(result, verdictFor) {
  if (!result.parsed) return { block: true, reason: result.reason };
  for (const invocation of result.invocations) {
    const reason = verdictFor(invocation);
    if (reason !== null) return { block: true, reason };
  }
  return { block: false };
}

/**
 * Parses the command and judges its invocations with `verdictFor`.
 *
 * @param {string} command
 * @param {(invocation: object) => string|null} verdictFor
 * @returns {{ block: boolean, reason?: string }}
 */
export function judgeInvocations(command, verdictFor) {
  return judgeParsed(gitInvocations(command), verdictFor);
}
