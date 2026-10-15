/** @typedef {{ text: string, dynamic: boolean }} ShellWord
 *  @typedef {{ words: ShellWord[] }} SimpleCommand
 *  @typedef {{ parsed: true, commands: SimpleCommand[] } | { parsed: false, reason: string }} ParseResult
 *  @typedef {{ kind: 'subcommand', subcommand: string, args: string[], configKeys: string[], dynamicArgCount: number }
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
const VALUE_SEPARATOR = '=';

const NO_SUBCOMMAND = Object.freeze({ kind: 'no-subcommand' });

const toWord = word => (typeof word === 'string' ? { text: word, dynamic: false } : word);

const configKey = text => text.split(VALUE_SEPARATOR)[0].toLowerCase();

const optionName = text => text.split(VALUE_SEPARATOR)[0];

const texts = words => words.map(word => word.text);

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

const extend = (invocation, computations) =>
  Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(invocation), ...lazyDescriptors(computations) });

const isLongValueOption = text => LONG_VALUE_OPTIONS.includes(optionName(text));

const isPrintAndExit = text =>
  PRINT_AND_EXIT_OPTIONS.includes(text) || text.startsWith(LIST_CMDS_PREFIX);

const isSkippedFlag = text => FLAG_OPTIONS.includes(text) || text.startsWith(EXEC_PATH_PREFIX);

// Positions are read by one predicate only, so they stay out of the invocation's visible shape.
const subcommandResult = (text, words, from, configKeys) =>
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
const indeterminate = (words, from) => extend({ kind: 'indeterminate' }, { rest: () => texts(words.slice(from)) });

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
const walkFrom = (words, start) => {
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

const normaliseFrom = (words, start) => walkFrom(words, start).invocation;

export const normaliseGitArgv = words => normaliseFrom(words.map(toWord), 0);

export const optionWords = words => {
  const end = words.indexOf(ARGS_END);
  return end === -1 ? words : words.slice(0, end);
};

const ARITHMETIC_HEREDOC =
  'craft: command not parseable (<< inside an arithmetic command) — denied fail-closed';
const UNTERMINATED_QUOTE = 'craft: command not parseable (unterminated quote) — denied fail-closed';
const NEWLINE = '\n';
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const BACKSLASH = '\\';
const MAX_COMMAND_LENGTH = 131072;
const COMMAND_TOO_LONG = "craft: command not parseable (longer than the guard's limit) — denied fail-closed";
const MAX_NESTING_DEPTH = 8;
const NESTING_TOO_DEEP = `craft: command not parseable (nesting deeper than ${MAX_NESTING_DEPTH}) — denied fail-closed`;
const BACKTICK = '`';
const DOLLAR = '$';
const OPEN_PAREN = '(';
const OPEN_BRACE = '{';
const VARIABLE_START = /[A-Za-z_0-9@*#?$!-]/;
const ARITHMETIC_OPEN_LEVEL = 2;
const PAREN_LEVEL = new Map([
  ['(', 1],
  [')', -1],
]);
const BACKTICK_ESCAPES = /\\([$`\\])/g;
const DOUBLE_QUOTE_ESCAPABLE = Object.freeze(['$', '`', DOUBLE_QUOTE, BACKSLASH]);
const REDIRECT_SUFFIXES = Object.freeze(['>', '&', '|']);
const FILE_DESCRIPTOR = /^\d+$/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const TIME_KEYWORD = 'time';
const TIME_FORMAT_FLAG = '-p';
const HEAD_WORDS = new Set([
  '{',
  '}',
  '!',
  TIME_KEYWORD,
  'if',
  'then',
  'elif',
  'else',
  'fi',
  'do',
  'done',
  'while',
  'until',
  'case',
  'esac',
  'coproc',
]);

const SHELL_NAMES = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const CLUSTER_SHAPE = /^[-+][A-Za-z]+$/;
const COMMAND_FLAG = 'c';
const PLUS_PREFIX = '+';

const basename = text => text.slice(text.lastIndexOf('/') + 1);

const isOption = ({ text }) => text.startsWith(OPTION_PREFIX);

const isFlagWord = ({ text }) => text.startsWith(OPTION_PREFIX) || text.startsWith(PLUS_PREFIX);

const isCommandCluster = ({ text }) => CLUSTER_SHAPE.test(text) && text.includes(COMMAND_FLAG);

// Shell option grammar (-o name, -O name, +e) is not modelled, so once a command option
// exists every later non-option word may be the command string.
const shellCommandWords = (words, index, scan) =>
  SHELL_NAMES.has(basename(words[index].text)) && scan.lastClusterAt > index && scan.lastCommandWordAt > index
    ? words.slice(index + 1).filter(word => !isFlagWord(word))
    : [];

const UNTERMINATED_SUBSTITUTION =
  'craft: command not parseable (unterminated substitution) — denied fail-closed';
const OPAQUE_STRING =
  'craft: command not parseable (an escaped $\'…\' string is evaluated as shell) — denied fail-closed';

const EVAL_WORD = 'eval';

const evalWords = (words, index) => {
  if (words[index].text !== EVAL_WORD || index + 1 >= words.length) return [];
  const rest = words.slice(index + 1);
  const joined = { text: rest.map(({ text }) => text).join(' '), dynamic: false };
  return [rest.some(({ opaque }) => opaque === true) ? { ...joined, opaque: true } : joined];
};

const ENV_WORD = 'env';
const SPLIT_LETTER = 'S';
const SKIPPED_VALUE_LETTERS = new Set(['u', 'C', 'P']);
const SPLIT_STRING_LONG = '--split-string';
const LONG_OPTION_PREFIX = '--';
const SKIPPED_LONG_OPTIONS = new Set(['--unset', '--chdir']);
const NO_ENV_VALUE = Object.freeze({ split: [], consumed: 0 });

// The value is either attached to the option word or the next word.
const attachedAt = (words, cursor, from) => words[cursor].text.length > from;

const consumedWords = (words, cursor, from) => (attachedAt(words, cursor, from) ? 0 : 1);

const skippedEnvValue = (words, cursor, from) => ({ split: [], consumed: consumedWords(words, cursor, from) });

const splitEnvValue = (words, cursor, from) => {
  const source = attachedAt(words, cursor, from)
    ? { ...words[cursor], text: words[cursor].text.slice(from) }
    : words[cursor + 1];
  return { split: source === undefined ? [] : [source], consumed: consumedWords(words, cursor, from) };
};

const longEnvOption = (words, cursor) => {
  const { text } = words[cursor];
  const separator = text.indexOf(VALUE_SEPARATOR);
  const name = separator === -1 ? text : text.slice(0, separator);
  const from = separator === -1 ? text.length : separator + 1;
  if (name === SPLIT_STRING_LONG) return splitEnvValue(words, cursor, from);
  return SKIPPED_LONG_OPTIONS.has(name) ? skippedEnvValue(words, cursor, from) : NO_ENV_VALUE;
};

const envOption = (words, cursor) => {
  const { text } = words[cursor];
  if (text.startsWith(LONG_OPTION_PREFIX)) return longEnvOption(words, cursor);
  for (let at = 1; at < text.length; at += 1) {
    if (text[at] === SPLIT_LETTER) return splitEnvValue(words, cursor, at + 1);
    if (SKIPPED_VALUE_LETTERS.has(text[at])) return skippedEnvValue(words, cursor, at + 1);
  }
  return NO_ENV_VALUE;
};

// A word inside an earlier env's option run is a value, never an env command, so skipping it
// keeps a chain of -S options from being scanned once per env word.
const envSplitWords = (words, index, optionsEnd) => {
  if (words[index].text !== ENV_WORD || index < optionsEnd) return { words: [], optionsEnd };
  const found = [];
  let cursor = index + 1;
  for (; cursor < words.length && isOption(words[cursor]); cursor += 1) {
    const { split, consumed } = envOption(words, cursor);
    found.push(...split);
    cursor += consumed;
  }
  return { words: found, optionsEnd: cursor };
};

// Each of these re-parses every later word already, so scanning past one repeats that work.
const STOPPING_WORDS = new Set([EVAL_WORD, ...SHELL_NAMES]);

// An eval string already holds every later word, so re-parsing past the first eval would
// only repeat that work once per eval word.
const reparsedWords = words => {
  const found = [];
  const scan = {
    lastClusterAt: words.findLastIndex(isCommandCluster),
    lastCommandWordAt: words.findLastIndex(word => !isFlagWord(word)),
  };
  let optionsEnd = 0;
  for (let index = 0; index < words.length; index += 1) {
    const env = envSplitWords(words, index, optionsEnd);
    optionsEnd = env.optionsEnd;
    const here = [...shellCommandWords(words, index, scan), ...evalWords(words, index), ...env.words];
    found.push(...here);
    if (here.length > 0 && STOPPING_WORDS.has(basename(words[index].text))) break;
  }
  return found;
};

const NO_ARITHMETIC = -1;

const createContext = (source, depth) => ({
  source,
  depth,
  parens: 0,
  dynamic: false,
  opaque: false,
  pattern: false,
  braceFailedUntil: 0,
  parameter: false,
  arithmeticFloor: NO_ARITHMETIC,
  index: 0,
  commands: [],
  words: [],
  assignments: [],
  piece: null,
  redirecting: false,
  timing: false,
  heredocs: [],
  failure: null,
});

// Lone test and group operators are words bash never expands.
const LITERAL_OPERATORS = new Set(['[', '[[', '{']);

const append = (context, text) => {
  context.piece = (context.piece ?? '') + text;
};

const isHeadWord = (context, { text }) =>
  context.words.length === 0 &&
  (HEAD_WORDS.has(text) ||
    ASSIGNMENT.test(text) ||
    (context.timing && text === TIME_FORMAT_FLAG));

const pushWord = (context, word) => {
  if (!isHeadWord(context, word)) {
    context.words.push(word);
    return;
  }
  if (ASSIGNMENT.test(word.text)) context.assignments.push(word.text);
  context.timing = word.text === TIME_KEYWORD;
};

const endWord = context => {
  if (context.piece === null) return;
  const literal = LITERAL_OPERATORS.has(context.piece);
  const word = {
    text: context.piece,
    dynamic: context.dynamic && !literal,
    ...(context.opaque && { opaque: true }),
    ...(context.pattern && !literal && { pattern: true }),
  };
  context.piece = null;
  context.dynamic = false;
  context.opaque = false;
  context.pattern = false;
  if (context.redirecting) {
    context.redirecting = false;
    return;
  }
  pushWord(context, word);
};

const parseNested = (context, text) => {
  const child = createContext(text, context.depth + 1);
  runBody(child, null);
  breakCommand(child);
  return child;
};

const reparse = (context, words) => {
  for (const { text, opaque } of reparsedWords(words)) {
    if (opaque === true) return fail(context, OPAQUE_STRING);
    if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);
    const child = parseNested(context, text);
    if (child.failure !== null) return fail(context, child.failure);
    context.commands.push(...child.commands);
  }
};

// The assignments are not part of the command's shape; they are read only to catch config channels.
const commandOf = ({ words, assignments }) =>
  Object.defineProperty({ words }, 'assignments', { value: assignments, enumerable: false });

const breakCommand = context => {
  endWord(context);
  if (context.words.length > 0) {
    context.commands.push(commandOf(context));
    reparse(context, context.words);
  }
  context.words = [];
  context.assignments = [];
  context.redirecting = false;
  context.timing = false;
};

const fail = (context, reason) => {
  context.failure ??= reason;
};

const onLiteral = context => {
  append(context, context.source[context.index]);
  context.index += 1;
};

const onWhitespace = context => {
  endWord(context);
  context.index += 1;
};

const onBreak = context => {
  breakCommand(context);
  context.index += 1;
};

const markPattern = context => {
  context.dynamic = true;
  context.pattern = true;
};

const onGlob = context => {
  markPattern(context);
  onLiteral(context);
};

const BRACE_WORD_END = new Set([' ', '\t', NEWLINE, ';', '|', '&', '(', ')', '<', '>']);
const BRACE_SEPARATOR = ',';
const BRACE_RANGE = '..';
const BRACE_CLOSE = '}';

const quoteEnd = (source, index) => {
  const close = source.indexOf(source[index], index + 1);
  return close === -1 ? source.length : close;
};

const braceSkip = (source, index) => {
  if (source[index] === BACKSLASH) return index + 1;
  return source[index] === SINGLE_QUOTE || source[index] === DOUBLE_QUOTE ? quoteEnd(source, index) : index;
};

// A scan that finds no brace expression proves none exists later in the same word, so
// remembering where it stopped keeps a run of braces linear; a word already marked as a
// pattern needs no further scan.
const hasBraceExpression = context => {
  const { source } = context;
  if (context.pattern || context.index < context.braceFailedUntil) return false;
  let separated = false;
  let index = context.index + 1;
  for (; index < source.length && !BRACE_WORD_END.has(source[index]); index = braceSkip(source, index) + 1) {
    separated ||= source[index] === BRACE_SEPARATOR || source.startsWith(BRACE_RANGE, index);
    if (separated && source[index] === BRACE_CLOSE) return true;
  }
  context.braceFailedUntil = index;
  return false;
};

const onBrace = context => {
  if (hasBraceExpression(context)) markPattern(context);
  onLiteral(context);
};

const onBackslash = context => {
  const next = context.source[context.index + 1];
  if (next === undefined) return onLiteral(context);
  if (next !== NEWLINE) append(context, next);
  context.index += 2;
};

const onSingleQuote = context => {
  const close = context.source.indexOf(SINGLE_QUOTE, context.index + 1);
  if (close === -1) return fail(context, UNTERMINATED_QUOTE);
  append(context, context.source.slice(context.index + 1, close));
  context.index = close + 1;
};

const consumeDoubleQuoted = context => {
  const next = context.source[context.index + 1];
  if (context.source[context.index] === DOLLAR) return onDoubleQuotedDollar(context);
  if (context.source[context.index] === BACKTICK) return enterBacktick(context);
  if (context.source[context.index] !== BACKSLASH) return onLiteral(context);
  if (next === NEWLINE) context.index += 2;
  else if (DOUBLE_QUOTE_ESCAPABLE.includes(next)) onBackslash(context);
  else onLiteral(context);
};

const onDoubleQuote = context => {
  append(context, '');
  context.index += 1;
  while (context.index < context.source.length) {
    if (context.source[context.index] === DOUBLE_QUOTE) {
      context.index += 1;
      return;
    }
    consumeDoubleQuoted(context);
    if (context.failure !== null) return;
  }
  fail(context, UNTERMINATED_QUOTE);
};

const readAnsiC = context => {
  append(context, '');
  context.index += 2;
  while (context.index < context.source.length) {
    if (context.source[context.index] === SINGLE_QUOTE) {
      context.index += 1;
      return;
    }
    onBackslashOrLiteral(context);
  }
  fail(context, UNTERMINATED_QUOTE);
};

const onBackslashOrLiteral = context =>
  context.source[context.index] === BACKSLASH && context.source[context.index + 1] !== undefined
    ? onEscapedChar(context)
    : onLiteral(context);

const onEscapedChar = context => {
  context.dynamic = true;
  context.opaque = true;
  append(context, context.source[context.index + 1]);
  context.index += 2;
};

const SUBSTITUTION = Object.freeze({ openLength: 2, close: ')', settle: breakCommand, parameter: false });

const PARAMETER = Object.freeze({ openLength: 2, close: '}', settle: endWord, parameter: true });

const runBody = (child, close) => {
  while (child.index < child.source.length && child.failure === null) {
    if (child.parens === 0 && child.source[child.index] === close) return true;
    step(child);
  }
  return close === null;
};

const absorb = (context, child) => {
  context.commands.push(...child.commands);
};

const markExpansion = (context, start, end) => {
  append(context, context.source.slice(start, end));
  context.index = end;
  context.dynamic = true;
};

const isTooDeep = context => context.depth >= MAX_NESTING_DEPTH;

const enterConstruct = (context, { openLength, close, settle, parameter }) => {
  if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);
  const start = context.index;
  const child = createContext(context.source, context.depth + 1);
  child.index = start + openLength;
  child.parameter = parameter;
  const closed = runBody(child, close);
  settle(child);
  if (child.failure !== null) return fail(context, child.failure);
  if (!closed) return fail(context, UNTERMINATED_SUBSTITUTION);
  absorb(context, child);
  markExpansion(context, start, child.index + 1);
};

const findBacktickEnd = (source, from) => {
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === BACKSLASH) index += 1;
    else if (source[index] === BACKTICK) return index;
  }
  return -1;
};

const enterBacktick = context => {
  if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);
  const start = context.index;
  const end = findBacktickEnd(context.source, start + 1);
  if (end === -1) return fail(context, UNTERMINATED_SUBSTITUTION);
  const body = context.source.slice(start + 1, end).replace(BACKTICK_ESCAPES, '$1');
  const child = parseNested(context, body);
  if (child.failure !== null) return fail(context, child.failure);
  absorb(context, child);
  markExpansion(context, start, end + 1);
};

const arithmeticEnd = (source, from) => {
  let level = ARITHMETIC_OPEN_LEVEL;
  for (let index = from; index < source.length; index += 1) {
    level += PAREN_LEVEL.get(source[index]) ?? 0;
    if (level === 0) return index + 1;
  }
  return -1;
};

const onArithmetic = context => {
  const end = arithmeticEnd(context.source, context.index + 3);
  if (end === -1) return fail(context, UNTERMINATED_SUBSTITUTION);
  markExpansion(context, context.index, end);
};

const enterDollarParen = context =>
  context.source[context.index + 2] === OPEN_PAREN ? onArithmetic(context) : enterConstruct(context, SUBSTITUTION);

const onVariable = context => {
  markExpansion(context, context.index, context.index + 2);
};

const expandDollar = context => {
  const next = context.source[context.index + 1];
  if (next === OPEN_PAREN) return enterDollarParen(context);
  if (next === OPEN_BRACE) return enterConstruct(context, PARAMETER);
  if (next !== undefined && VARIABLE_START.test(next)) return onVariable(context);
  onLiteral(context);
};

const onLocaleString = context => {
  context.index += 1;
  onDoubleQuote(context);
};

const onDollar = context => {
  const next = context.source[context.index + 1];
  if (next === SINGLE_QUOTE) return readAnsiC(context);
  if (next === DOUBLE_QUOTE) return onLocaleString(context);
  expandDollar(context);
};

const onDoubleQuotedDollar = context =>
  context.source[context.index + 1] === SINGLE_QUOTE ? onLiteral(context) : expandDollar(context);

const HEREDOC_OPERATOR = '<<';
const HERE_STRING_OPERATOR = '<<<';
const STRIP_TABS_FLAG = '-';
const LEADING_TABS = /^\t+/;
const DELIMITER_END = new Set([' ', '\t', NEWLINE, ';', '|', '&', '<', '>', '(', ')']);

const readQuotedPart = (context, delimiter) => {
  const quote = context.source[context.index];
  const close = context.source.indexOf(quote, context.index + 1);
  if (close === -1) return fail(context, UNTERMINATED_QUOTE);
  delimiter.text += context.source.slice(context.index + 1, close);
  delimiter.quoted = true;
  context.index = close + 1;
};

const readEscapedPart = (context, delimiter) => {
  delimiter.text += context.source[context.index + 1] ?? '';
  delimiter.quoted = true;
  context.index += 2;
};

const readDelimiterPart = (context, delimiter) => {
  const char = context.source[context.index];
  if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) return readQuotedPart(context, delimiter);
  if (char === BACKSLASH) return readEscapedPart(context, delimiter);
  delimiter.text += char;
  context.index += 1;
};

const readDelimiter = context => {
  const delimiter = { text: '', quoted: false };
  while (
    context.index < context.source.length &&
    context.failure === null &&
    !DELIMITER_END.has(context.source[context.index])
  ) {
    readDelimiterPart(context, delimiter);
  }
  return delimiter;
};

const skipBlanks = context => {
  while (context.source[context.index] === ' ' || context.source[context.index] === '\t') context.index += 1;
};

const onHeredoc = context => {
  if (context.arithmeticFloor !== NO_ARITHMETIC) return fail(context, ARITHMETIC_HEREDOC);
  if (FILE_DESCRIPTOR.test(context.piece ?? '')) context.piece = null;
  endWord(context);
  context.index += HEREDOC_OPERATOR.length;
  const stripTabs = context.source[context.index] === STRIP_TABS_FLAG;
  if (stripTabs) context.index += 1;
  skipBlanks(context);
  const delimiter = readDelimiter(context);
  if (context.failure === null) context.heredocs.push({ ...delimiter, stripTabs });
};

const readHeredocBody = (context, { text, stripTabs }) => {
  const lines = [];
  while (context.index < context.source.length) {
    const lineEnd = context.source.indexOf(NEWLINE, context.index);
    const end = lineEnd === -1 ? context.source.length : lineEnd;
    const raw = context.source.slice(context.index, end);
    const line = stripTabs ? raw.replace(LEADING_TABS, '') : raw;
    context.index = lineEnd === -1 ? end : end + 1;
    if (line === text) break;
    lines.push(line);
  }
  return lines.join(NEWLINE);
};

const scanExpansions = (context, body) => {
  const scratch = createContext(body, context.depth);
  while (scratch.index < body.length && scratch.failure === null) consumeDoubleQuoted(scratch);
  context.commands.push(...scratch.commands);
  if (scratch.failure !== null) fail(context, scratch.failure);
};

const consumeHeredoc = (context, heredoc) => {
  const body = readHeredocBody(context, heredoc);
  if (!heredoc.quoted) scanExpansions(context, body);
};

const readHeredocBodies = context => {
  for (const heredoc of context.heredocs.splice(0)) {
    if (context.failure === null) consumeHeredoc(context, heredoc);
  }
};

const onHereString = context => {
  context.index += HERE_STRING_OPERATOR.length - 1;
  onRedirect(context);
};

const onNewline = context => {
  context.index += 1;
  readHeredocBodies(context);
  breakCommand(context);
};

// Inside ${…} a # is the length or trim operator; reading it as a comment would hide the rest of the line.
const onHash = context => {
  if (context.piece !== null || context.parameter) return onLiteral(context);
  const lineEnd = context.source.indexOf(NEWLINE, context.index);
  context.index = lineEnd === -1 ? context.source.length : lineEnd;
};

const onRedirect = context => {
  if (FILE_DESCRIPTOR.test(context.piece ?? '')) context.piece = null;
  endWord(context);
  context.index += 1;
  if (REDIRECT_SUFFIXES.includes(context.source[context.index])) context.index += 1;
  context.redirecting = true;
};

const OPENS_ARITHMETIC = '((';

const onOpenParen = context => {
  const adjacent = context.source.startsWith(OPENS_ARITHMETIC, context.index - 1) && context.index > 0;
  if (adjacent && context.arithmeticFloor === NO_ARITHMETIC) context.arithmeticFloor = context.parens - 1;
  context.parens += 1;
  onBreak(context);
};

const onCloseParen = context => {
  context.parens = Math.max(0, context.parens - 1);
  if (context.parens <= context.arithmeticFloor) context.arithmeticFloor = NO_ARITHMETIC;
  onBreak(context);
};

const startsWithAt = (context, token) => context.source.startsWith(token, context.index);

const onAngle = context => {
  if (context.source[context.index + 1] === OPEN_PAREN) return enterConstruct(context, SUBSTITUTION);
  if (startsWithAt(context, HERE_STRING_OPERATOR)) return onHereString(context);
  if (startsWithAt(context, HEREDOC_OPERATOR)) return onHeredoc(context);
  onRedirect(context);
};

const onAmpersand = context =>
  context.source[context.index + 1] === '>' ? onAmpersandRedirect(context) : onBreak(context);

const onAmpersandRedirect = context => {
  context.index += 1;
  onRedirect(context);
};

const CHAR_HANDLERS = new Map([
  [' ', onWhitespace],
  ['\t', onWhitespace],
  [NEWLINE, onNewline],
  [';', onBreak],
  ['|', onBreak],
  [OPEN_PAREN, onOpenParen],
  [')', onCloseParen],
  ['&', onAmpersand],
  ['<', onAngle],
  ['>', onAngle],
  [BACKTICK, enterBacktick],
  ['#', onHash],
  [DOLLAR, onDollar],
  [BACKSLASH, onBackslash],
  ['*', onGlob],
  ['?', onGlob],
  ['[', onGlob],
  ['{', onBrace],
  [SINGLE_QUOTE, onSingleQuote],
  [DOUBLE_QUOTE, onDoubleQuote],
]);

const step = context => (CHAR_HANDLERS.get(context.source[context.index]) ?? onLiteral)(context);

export function parseShellCommands(command) {
  if (command.length > MAX_COMMAND_LENGTH) return { parsed: false, reason: COMMAND_TOO_LONG };
  const context = createContext(command, 0);
  while (context.index < command.length && context.failure === null) step(context);
  breakCommand(context);
  if (context.failure !== null) return { parsed: false, reason: context.failure };
  return { parsed: true, commands: context.commands };
}

const GIT_COMMAND = 'git';
const PATH_SEPARATOR = '/';
const ALIAS_KEY_PREFIX = 'alias.';

export const INLINE_ALIAS_REASON =
  'craft: an inline git alias (-c alias.*) is denied — it can run any git verb';

const isGitWord = word => !word.dynamic && word.text.split(PATH_SEPARATOR).pop().toLowerCase() === GIT_COMMAND;

// Judges read only the words that open the command (a proxy prefix), so the copy stays bounded
// however far into a long command the git word sits.
export const LEADING_WORDS_LIMIT = 2;

const leadingOf = (words, index) => texts(words.slice(0, Math.min(index, LEADING_WORDS_LIMIT)));

const anchoredAt = (words, index) => {
  const { invocation, end } = walkFrom(words, index + 1);
  return { anchor: extend(invocation, { leadingWords: () => leadingOf(words, index) }), end };
};

const dynamicHeadInvocation = words => extend(normaliseFrom(words, 1), { leadingWords: () => [] });

export const DESTRUCTIVE_VERBS = Object.freeze(['push', 'reset', 'clean', 'branch']);
export const DIFFING_VERBS = Object.freeze(['diff', 'show']);
const ANCHOR_VERBS = new Set([...DESTRUCTIVE_VERBS, ...DIFFING_VERBS]);
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
 * Parses the command and returns the first reason `verdictFor` gives an invocation;
 * a command that cannot be parsed is denied fail-closed with the parser's reason.
 *
 * @param {string} command
 * @param {(invocation: object) => string|null} verdictFor
 * @returns {{ block: boolean, reason?: string }}
 */
export function judgeInvocations(command, verdictFor) {
  const result = gitInvocations(command);
  if (!result.parsed) return { block: true, reason: result.reason };
  for (const invocation of result.invocations) {
    const reason = verdictFor(invocation);
    if (reason !== null) return { block: true, reason };
  }
  return { block: false };
}
