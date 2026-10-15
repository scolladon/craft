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
const SUBCOMMAND_ALIASES = Object.freeze({
  '-v': 'version',
  '--version': 'version',
  '-h': 'help',
  '--help': 'help',
});
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
const lazyDescriptors = computations =>
  Object.fromEntries(
    Object.entries(computations).map(([name, compute]) => [name, { get: memoise(compute), enumerable: true }])
  );

const extend = (invocation, computations) =>
  Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(invocation), ...lazyDescriptors(computations) });

const isLongValueOption = text => LONG_VALUE_OPTIONS.includes(optionName(text));

const isPrintAndExit = text =>
  PRINT_AND_EXIT_OPTIONS.includes(text) || text.startsWith(LIST_CMDS_PREFIX);

const isSkippedFlag = text => FLAG_OPTIONS.includes(text) || text.startsWith(EXEC_PATH_PREFIX);

const subcommandResult = (text, words, from, configKeys) =>
  extend(
    { kind: 'subcommand', subcommand: SUBCOMMAND_ALIASES[text] ?? text, configKeys },
    { args: () => texts(words.slice(from)), dynamicArgCount: () => countDynamic(words, from) }
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

// Returns the cursor past a global option, the same cursor when the word is not one,
// or null when a value-taking option has no value.
const advance = (words, cursor, configKeys) => {
  const { text } = words[cursor];
  if (isSkippedFlag(text)) return cursor + 1;
  if (!isValueOption(text)) return cursor;
  const consumed = valueOptionAt(words, cursor);
  if (consumed === null) return null;
  configKeys.push(...consumed.keys);
  return consumed.next;
};

const lateExit = (words, cursor, configKeys) => {
  const { text } = words[cursor];
  if (text.startsWith(OPTION_PREFIX) && !(text in SUBCOMMAND_ALIASES)) return refused(words, cursor);
  return subcommandResult(text, words, cursor + 1, configKeys);
};

const normaliseFrom = (words, start) => {
  const configKeys = [];
  let cursor = start;
  while (cursor < words.length) {
    const early = earlyExit(words, cursor);
    if (early !== null) return early;
    const next = advance(words, cursor, configKeys);
    if (next === null) return NO_SUBCOMMAND;
    if (next === cursor) return lateExit(words, cursor, configKeys);
    cursor = next;
  }
  return NO_SUBCOMMAND;
};

export const normaliseGitArgv = words => normaliseFrom(words.map(toWord), 0);

const UNTERMINATED_QUOTE = 'craft: command not parseable (unterminated quote) — denied fail-closed';
const NEWLINE = '\n';
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const BACKSLASH = '\\';
const MAX_COMMAND_LENGTH = 131072;
const COMMAND_TOO_LONG = "craft: command not parseable (longer than the guard's limit) — denied fail-closed";
const WORK_BUDGET_FACTOR = 16;
const WORK_EXCEEDED = 'craft: command not parseable (too much nesting work) — denied fail-closed';
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
const CLUSTER_SHAPE = /^-[A-Za-z]+$/;
const COMMAND_FLAG = 'c';

const basename = text => text.slice(text.lastIndexOf('/') + 1);

const isOption = ({ text }) => text.startsWith(OPTION_PREFIX);

const isCommandCluster = text => CLUSTER_SHAPE.test(text) && text.includes(COMMAND_FLAG);

const optionRunEnd = (words, from) => {
  let end = from;
  while (end < words.length && isOption(words[end])) end += 1;
  return end;
};

const hasCommandOption = (words, from, to) => {
  for (let index = from; index < to; index += 1) {
    if (isCommandCluster(words[index].text)) return true;
  }
  return false;
};

const shellCommandString = (words, index) => {
  if (!SHELL_NAMES.has(basename(words[index].text))) return null;
  const targetIndex = optionRunEnd(words, index + 1);
  const target = words[targetIndex];
  return target !== undefined && hasCommandOption(words, index + 1, targetIndex) ? target.text : null;
};

const UNTERMINATED_SUBSTITUTION =
  'craft: command not parseable (unterminated substitution) — denied fail-closed';

const EVAL_WORD = 'eval';
const ENV_WORD = 'env';
const SPLIT_STRING_SHORT = '-S';
const SPLIT_STRING_LONG = '--split-string';
const SPLIT_STRING_ATTACHED = `${SPLIT_STRING_LONG}=`;

const evalString = (words, index) =>
  words[index].text === EVAL_WORD && index + 1 < words.length
    ? words
        .slice(index + 1)
        .map(({ text }) => text)
        .join(' ')
    : null;

const splitStringValue = (words, index) => {
  const { text } = words[index];
  if (text.startsWith(SPLIT_STRING_ATTACHED)) return text.slice(SPLIT_STRING_ATTACHED.length);
  const isSeparate = text === SPLIT_STRING_SHORT || text === SPLIT_STRING_LONG;
  return isSeparate ? (words[index + 1]?.text ?? null) : null;
};

const envSplitString = (words, index) => {
  if (words[index].text !== ENV_WORD) return null;
  for (let option = index + 1; option < words.length && isOption(words[option]); option += 1) {
    const value = splitStringValue(words, option);
    if (value !== null) return value;
  }
  return null;
};

const REPARSERS = Object.freeze([shellCommandString, evalString, envSplitString]);

const stringAt = (words, index) => {
  for (const find of REPARSERS) {
    const string = find(words, index);
    if (string !== null) return string;
  }
  return null;
};

// An eval string already holds every later word, so re-parsing past the first eval would
// only repeat that work once per eval word.
const reparsedStrings = words => {
  const strings = [];
  for (let index = 0; index < words.length; index += 1) {
    const string = stringAt(words, index);
    if (string !== null) strings.push(string);
    if (string !== null && words[index].text === EVAL_WORD) break;
  }
  return strings;
};

const createContext = (source, depth, budget) => ({
  source,
  depth,
  budget,
  parens: 0,
  dynamic: false,
  index: 0,
  commands: [],
  words: [],
  piece: null,
  redirecting: false,
  timing: false,
  heredocs: [],
  failure: null,
});

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
  context.timing = word.text === TIME_KEYWORD;
};

const endWord = context => {
  if (context.piece === null) return;
  const word = { text: context.piece, dynamic: context.dynamic };
  context.piece = null;
  context.dynamic = false;
  if (context.redirecting) {
    context.redirecting = false;
    return;
  }
  pushWord(context, word);
};

// Bodies are scanned again from their own text; the shared budget caps that repeated work.
const charge = (context, length) => {
  context.budget.remaining -= length;
  if (context.budget.remaining >= 0) return true;
  fail(context, WORK_EXCEEDED);
  return false;
};

const parseNested = (context, text) => {
  const child = createContext(text, context.depth + 1, context.budget);
  runBody(child, null);
  breakCommand(child);
  return child;
};

const reparse = (context, words) => {
  for (const text of reparsedStrings(words)) {
    if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);
    if (!charge(context, text.length)) return;
    const child = parseNested(context, text);
    if (child.failure !== null) return fail(context, child.failure);
    context.commands.push(...child.commands);
  }
};

const breakCommand = context => {
  endWord(context);
  if (context.words.length > 0) {
    context.commands.push({ words: context.words });
    reparse(context, context.words);
  }
  context.words = [];
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
  append(context, context.source[context.index + 1]);
  context.index += 2;
};

const SUBSTITUTION = Object.freeze({ openLength: 2, close: ')', settle: breakCommand });

const PARAMETER = Object.freeze({ openLength: 2, close: '}', settle: endWord });

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

const enterConstruct = (context, { openLength, close, settle }) => {
  if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);
  const start = context.index;
  const child = createContext(context.source, context.depth + 1, context.budget);
  child.index = start + openLength;
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
  if (!charge(context, body.length)) return;
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

const onDollar = context =>
  context.source[context.index + 1] === SINGLE_QUOTE ? readAnsiC(context) : expandDollar(context);

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
  if (!charge(context, body.length)) return;
  const scratch = createContext(body, context.depth, context.budget);
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

const onHash = context => {
  if (context.piece !== null) return onLiteral(context);
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

const onOpenParen = context => {
  context.parens += 1;
  onBreak(context);
};

const onCloseParen = context => {
  context.parens = Math.max(0, context.parens - 1);
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
  [SINGLE_QUOTE, onSingleQuote],
  [DOUBLE_QUOTE, onDoubleQuote],
]);

const step = context => (CHAR_HANDLERS.get(context.source[context.index]) ?? onLiteral)(context);

export function parseShellCommands(command) {
  if (command.length > MAX_COMMAND_LENGTH) return { parsed: false, reason: COMMAND_TOO_LONG };
  const context = createContext(command, 0, { remaining: command.length * WORK_BUDGET_FACTOR });
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

const isGitWord = word => !word.dynamic && word.text.split(PATH_SEPARATOR).pop() === GIT_COMMAND;

const anchoredAt = (words, index) =>
  extend(normaliseFrom(words, index + 1), { leadingWords: () => texts(words.slice(0, index)) });

const dynamicHeadInvocation = words => extend(normaliseFrom(words, 1), { leadingWords: () => [] });

const anchoredInvocations = ({ words }) => {
  const anchors = words.flatMap((word, index) => (isGitWord(word) ? [anchoredAt(words, index)] : []));
  return words[0]?.dynamic === true ? [dynamicHeadInvocation(words), ...anchors] : anchors;
};

export function gitInvocations(command) {
  const result = parseShellCommands(command);
  if (!result.parsed) return result;
  return { parsed: true, invocations: result.commands.flatMap(anchoredInvocations) };
}

export const hasInlineAlias = invocation =>
  invocation.kind === 'subcommand' && invocation.configKeys.some(key => key.startsWith(ALIAS_KEY_PREFIX));
