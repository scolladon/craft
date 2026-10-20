/** @typedef {{ kind: 'subcommand', subcommand: string, args: string[], configKeys: string[], dynamicArgCount: number }
 *         | { kind: 'refused', option: string, rest: string[] }
 *         | { kind: 'indeterminate', rest: string[] }
 *         | { kind: 'no-subcommand' }} GitInvocation */

const SHORT_VALUE_OPTIONS = Object.freeze(['-C', '-c']);
const LONG_VALUE_OPTIONS = Object.freeze([
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
  '--attr-source',
]);
const CONFIG_OPTIONS = Object.freeze(['-c', '--config-env']);
const FLAG_OPTIONS = Object.freeze([
  '--no-pager',
  '-p',
  '--paginate',
  '-P',
  '--no-optional-locks',
  '--literal-pathspecs',
  '--glob-pathspecs',
  '--noglob-pathspecs',
  '--icase-pathspecs',
  '--no-replace-objects',
  '--no-lazy-fetch',
  '--no-advice',
  '--bare',
]);
const EXEC_PATH_PREFIX = '--exec-path=';
const LIST_CMDS_PREFIX = '--list-cmds=';
const PRINT_AND_EXIT_OPTIONS = Object.freeze([
  '--exec-path',
  '--html-path',
  '--man-path',
  '--info-path',
]);
const SUBCOMMAND_ALIASES = new Map([
  ['-v', 'version'],
  ['--version', 'version'],
  ['-h', 'help'],
  ['--help', 'help'],
]);
const ARGS_END = '--';
const OPTION_PREFIX = '-';
export const VALUE_SEPARATOR = '=';

export const NO_SUBCOMMAND = Object.freeze({ kind: 'no-subcommand' });

export const toWord = word => (typeof word === 'string' ? { text: word, dynamic: false } : word);

const configKey = text => text.split(VALUE_SEPARATOR)[0].toLowerCase();

const optionName = text => text.split(VALUE_SEPARATOR)[0];

export const texts = words => words.map(word => word.text);

const countDynamic = (words, from) => {
  let count = 0;
  for (let index = from; index < words.length && words[index].text !== ARGS_END; index += 1) {
    if (words[index].dynamic) count += 1;
  }
  return count;
};

// Positions, within the arguments, of the dynamic words ahead of the argument terminator.
const dynamicPositions = (words, from) => {
  const positions = [];
  for (let index = from; index < words.length && words[index].text !== ARGS_END; index += 1) {
    if (words[index].dynamic) positions.push(index - from);
  }
  return positions;
};

const VISIBLE = Object.freeze({ enumerable: true });
// equivalent mutant (ObjectLiteral {}): defineProperties defaults enumerable to false for a property it creates, so an empty descriptor hides the key identically
const HIDDEN = Object.freeze({ enumerable: false });

const UNSET = Symbol('unset');

const memoise = compute => {
  let value = UNSET;
  return () => {
    if (value === UNSET) value = compute();
    return value;
  };
};

// Derived arrays are computed on first read: copying the tail for every git word of a
// long command would make anchoring quadratic, and most verdicts never read them.
const lazyDescriptors = (computations, visibility = VISIBLE) =>
  Object.fromEntries(
    Object.entries(computations).map(([name, compute]) => [name, { get: memoise(compute), ...visibility }])
  );

export const extend = (invocation, computations) =>
  Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(invocation), ...lazyDescriptors(computations) });

const isLongValueOption = text => LONG_VALUE_OPTIONS.includes(optionName(text));

const isPrintAndExit = text =>
  PRINT_AND_EXIT_OPTIONS.includes(text) || text.startsWith(LIST_CMDS_PREFIX);

const isSkippedFlag = text => FLAG_OPTIONS.includes(text) || text.startsWith(EXEC_PATH_PREFIX);

// Positions are read by one predicate only, so they stay out of the invocation's visible shape.
export const subcommandResult = (text, words, from, configKeys) =>
  Object.defineProperties(
    extend(
      { kind: 'subcommand', subcommand: SUBCOMMAND_ALIASES.get(text) ?? text, configKeys },
      { args: () => texts(words.slice(from)), dynamicArgCount: () => countDynamic(words, from) }
    ),
    lazyDescriptors({ dynamicArgPositions: () => dynamicPositions(words, from) }, HIDDEN)
  );

// Consumes a value-taking option; returns the cursor after it and the config keys it
// declares, or null when the value is missing.
const valueOptionAt = (words, cursor) => {
  const { text } = words[cursor];
  const attached = text.includes(VALUE_SEPARATOR) && isLongValueOption(text);
  const value = attached ? text.slice(text.indexOf(VALUE_SEPARATOR) + 1) : words[cursor + 1]?.text;
  if (value === undefined) return null;
  const keys = CONFIG_OPTIONS.includes(optionName(text)) ? [configKey(value)] : [];
  return { next: cursor + (attached ? 1 : 2), keys };
};

const isValueOption = text => SHORT_VALUE_OPTIONS.includes(text) || isLongValueOption(text);

// A dynamic word where git expects an option or the subcommand may expand to anything.
export const indeterminate = (words, from) => extend({ kind: 'indeterminate' }, { rest: () => texts(words.slice(from)) });

const refused = (words, cursor) =>
  extend({ kind: 'refused', option: words[cursor].text }, { rest: () => texts(words.slice(cursor + 1)) });

const earlyExit = (words, cursor) => {
  const head = words[cursor];
  if (head.dynamic) return indeterminate(words, cursor);
  return isPrintAndExit(head.text) ? NO_SUBCOMMAND : null;
};

const NO_KEYS = Object.freeze([]);

// Returns the cursor past a global option and the config keys it declares, the same cursor
// when the word is not one, or null when a value-taking option has no value.
const advance = (words, cursor) => {
  const { text } = words[cursor];
  if (isSkippedFlag(text)) return { next: cursor + 1, keys: NO_KEYS };
  if (!isValueOption(text)) return { next: cursor, keys: NO_KEYS };
  return valueOptionAt(words, cursor);
};

const lateExit = (words, cursor, configKeys) => {
  const { text } = words[cursor];
  if (text.startsWith(OPTION_PREFIX) && !SUBCOMMAND_ALIASES.has(text)) return refused(words, cursor);
  return subcommandResult(text, words, cursor + 1, configKeys);
};

// `end` is where the global option run stops: every word before it is an option or a value.
export const walkFrom = (words, start) => {
  const configKeys = [];
  let cursor = start;
  while (cursor < words.length) {
    const early = earlyExit(words, cursor);
    if (early !== null) return { invocation: early, end: cursor };
    const consumed = advance(words, cursor);
    if (consumed === null) return { invocation: NO_SUBCOMMAND, end: cursor };
    if (consumed.next === cursor) return { invocation: lateExit(words, cursor, configKeys), end: cursor };
    configKeys.push(...consumed.keys);
    cursor = consumed.next;
  }
  return { invocation: NO_SUBCOMMAND, end: words.length };
};

export const normaliseFrom = (words, start) => walkFrom(words, start).invocation;

export const normaliseGitArgv = words => normaliseFrom(words.map(toWord), 0);

export const optionWords = words => {
  const end = words.indexOf(ARGS_END);
  return end === -1 ? words : words.slice(0, end);
};

export const DESTRUCTIVE_VERBS = Object.freeze(['push', 'reset', 'clean', 'branch']);
export const DIFFING_VERBS = Object.freeze(['diff', 'show']);
export const EXT_DIFF_WORD = '--ext-diff';
