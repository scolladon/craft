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

const countDynamic = words => {
  const end = words.findIndex(word => word.text === ARGS_END);
  const counted = end === -1 ? words : words.slice(0, end);
  return counted.filter(word => word.dynamic).length;
};

const isLongValueOption = text => LONG_VALUE_OPTIONS.includes(optionName(text));

const isPrintAndExit = text =>
  PRINT_AND_EXIT_OPTIONS.includes(text) || text.startsWith(LIST_CMDS_PREFIX);

const isSkippedFlag = text => FLAG_OPTIONS.includes(text) || text.startsWith(EXEC_PATH_PREFIX);

const subcommandResult = (text, rest, configKeys) => ({
  kind: 'subcommand',
  subcommand: SUBCOMMAND_ALIASES[text] ?? text,
  args: texts(rest),
  configKeys,
  dynamicArgCount: countDynamic(rest),
});

// Consumes a value-taking option; returns the words left after it, or null when
// the value is missing.
const consumeValueOption = (words, configKeys) => {
  const { text } = words[0];
  const attached = text.includes(VALUE_SEPARATOR) && isLongValueOption(text);
  const value = attached ? text.slice(text.indexOf(VALUE_SEPARATOR) + 1) : words[1]?.text;
  if (value === undefined) return null;
  if (CONFIG_OPTIONS.includes(optionName(text))) configKeys.push(configKey(value));
  return words.slice(attached ? 1 : 2);
};

const isValueOption = text => SHORT_VALUE_OPTIONS.includes(text) || isLongValueOption(text);

export function normaliseGitArgv(words) {
  const configKeys = [];
  let remaining = words.map(toWord);
  while (remaining.length > 0) {
    const [head, ...tail] = remaining;
    const { text } = head;
    if (head.dynamic) return { kind: 'indeterminate', rest: texts(remaining) };
    if (isPrintAndExit(text)) return NO_SUBCOMMAND;
    if (isSkippedFlag(text)) {
      remaining = tail;
      continue;
    }
    if (isValueOption(text)) {
      remaining = consumeValueOption(remaining, configKeys);
      if (remaining === null) return NO_SUBCOMMAND;
      continue;
    }
    if (text.startsWith(OPTION_PREFIX) && !(text in SUBCOMMAND_ALIASES)) {
      return { kind: 'refused', option: text, rest: texts(tail) };
    }
    return subcommandResult(text, tail, configKeys);
  }
  return NO_SUBCOMMAND;
}

const UNTERMINATED_QUOTE = 'craft: command not parseable (unterminated quote) — denied fail-closed';
const NEWLINE = '\n';
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const BACKSLASH = '\\';
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

const UNTERMINATED_SUBSTITUTION =
  'craft: command not parseable (unterminated substitution) — denied fail-closed';

const createContext = (source, depth = 0) => ({
  source,
  depth,
  parens: 0,
  dynamic: false,
  index: 0,
  commands: [],
  words: [],
  piece: null,
  redirecting: false,
  timing: false,
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

const breakCommand = context => {
  endWord(context);
  if (context.words.length > 0) context.commands.push({ words: context.words });
  context.words = [];
  context.redirecting = false;
  context.timing = false;
};

const fail = (context, reason) => {
  context.failure = reason;
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

const absorb = (context, child, settle) => {
  settle(child);
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
  const child = createContext(context.source, context.depth + 1);
  child.index = start + openLength;
  const closed = runBody(child, close);
  if (child.failure !== null) return fail(context, child.failure);
  if (!closed) return fail(context, UNTERMINATED_SUBSTITUTION);
  absorb(context, child, settle);
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
  const child = createContext(body, context.depth + 1);
  runBody(child, null);
  if (child.failure !== null) return fail(context, child.failure);
  absorb(context, child, breakCommand);
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

const onAngle = context =>
  context.source[context.index + 1] === OPEN_PAREN ? enterConstruct(context, SUBSTITUTION) : onRedirect(context);

const onAmpersand = context =>
  context.source[context.index + 1] === '>' ? onAmpersandRedirect(context) : onBreak(context);

const onAmpersandRedirect = context => {
  context.index += 1;
  onRedirect(context);
};

const CHAR_HANDLERS = new Map([
  [' ', onWhitespace],
  ['\t', onWhitespace],
  [NEWLINE, onBreak],
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
  const context = createContext(command);
  while (context.index < command.length && context.failure === null) step(context);
  if (context.failure !== null) return { parsed: false, reason: context.failure };
  breakCommand(context);
  return { parsed: true, commands: context.commands };
}
