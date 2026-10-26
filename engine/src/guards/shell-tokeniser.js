/** @typedef {{ text: string, dynamic: boolean }} ShellWord
 *  @typedef {{ words: ShellWord[] }} SimpleCommand
 *  @typedef {{ parsed: true, commands: SimpleCommand[] } | { parsed: false, reason: string }} ParseResult */

const OPTION_PREFIX = '-';
const VALUE_SEPARATOR = '=';

const ARITHMETIC_HEREDOC =
  'craft: command not parseable (<< inside an arithmetic command) — denied fail-closed';
const HEREDOC_LIST_IN_SUBSTITUTION =
  'craft: command not parseable (a ; after a here-document inside $( ) or <( ) — bash 5.3 drops it) — denied fail-closed';
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
const OPEN_BRACKET = '[';
const CLOSE_BRACKET = ']';
const VARIABLE_START = /[A-Za-z_0-9@*#?$!-]/;
// bash 5.3 runs ${ …; } and ${| …; } as a command list in the current shell, closing it only at a } where a
// command can start; that rule reaches into [[ ]], case patterns and array values, so the guard refuses the form.
const FUNCTION_SUBSTITUTION_OPENER = /[ \t\n|]/;
const FUNCTION_SUBSTITUTION_REFUSED =
  'craft: command not parseable (a bash 5.3 ${ …; } or ${| …; } function substitution) — denied fail-closed';
const BACKTICK_ESCAPES = /\\([$`\\])/g;
const DOUBLE_QUOTE_ESCAPABLE = Object.freeze(['$', '`', DOUBLE_QUOTE, BACKSLASH]);
const REDIRECT_SUFFIXES = Object.freeze(['>', '&', '|']);
const FILE_DESCRIPTOR = /^\d+$/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const TIME_KEYWORD = 'time';
const TIME_FORMAT_FLAG = '-p';
const CASE_KEYWORD = 'case';
// A case pattern's ) can close a $( ) body early here, so the commands after it would escape the body. bash reads
// case as a keyword in more positions than this tokeniser tracks (after function NAME, coproc NAME, {), so the guard refuses any case word.
const CASE_IN_SUBSTITUTION =
  'craft: command not parseable (case inside $( ), <( ) or >( ) — a pattern ) can close it) — denied fail-closed';
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
  CASE_KEYWORD,
  'esac',
  'coproc',
]);

const SHELL_NAMES = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const CLUSTER_SHAPE = /^[-+][A-Za-z]+$/;
const COMMAND_FLAG = 'c';
const PLUS_PREFIX = '+';

// zsh expands a word that opens with `=` to the path of the command it names, so `=git` runs git.
const ZSH_EQUALS_PREFIX = /^=/;

export const basename = text => text.slice(text.lastIndexOf('/') + 1).replace(ZSH_EQUALS_PREFIX, '');

const isOption = ({ text }) => text.startsWith(OPTION_PREFIX);

const isFlagWord = ({ text }) => text.startsWith(OPTION_PREFIX) || text.startsWith(PLUS_PREFIX);

const isCommandCluster = ({ text }) => CLUSTER_SHAPE.test(text) && text.includes(COMMAND_FLAG);

// Shell option grammar (-o name, -O name, +e) is not modelled, so once a command option
// exists every later non-option word may be the command string.
// equivalent mutant (EqualityOperator scan.lastClusterAt >= index): a shell name is never a cluster word, so the two indices never meet
// equivalent mutant (EqualityOperator scan.lastCommandWordAt >= index): when the shell is the last non-flag word the filtered tail is empty either way
const shellCommandWords = (words, index, scan) =>
  SHELL_NAMES.has(basename(words[index].text)) && scan.lastClusterAt > index && scan.lastCommandWordAt > index
    ? words.slice(index + 1).filter(word => !isFlagWord(word))
    : [];

const UNTERMINATED_SUBSTITUTION =
  'craft: command not parseable (unterminated substitution) — denied fail-closed';
const OPAQUE_STRING =
  'craft: command not parseable (an escaped $\'…\' string is evaluated as shell) — denied fail-closed';

const EVAL_WORD = 'eval';

// equivalent mutant (BooleanLiteral dynamic true): reparse reads only the text and opaque fields of the joined word
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

// equivalent mutant (EqualityOperator at <= text.length): text[text.length] is undefined, which is neither the split letter nor a skipped-value letter
const envOption = (words, cursor) => {
  const { text } = words[cursor];
  if (text.startsWith(LONG_OPTION_PREFIX)) return longEnvOption(words, cursor);
  for (let at = 1; at < text.length; at += 1) {
    if (text[at] === SPLIT_LETTER) return splitEnvValue(words, cursor, at + 1);
    if (SKIPPED_VALUE_LETTERS.has(text[at])) return skippedEnvValue(words, cursor, at + 1);
  }
  return NO_ENV_VALUE;
};

// env re-splits a -S string with its own rules (comments, escapes, further options) and appends
// every later word to the command it runs, so that argv is not one this parser can read.
const ENV_RESPLIT =
  'craft: command not parseable (env -S re-splits its string with the words after it) — denied fail-closed';
const RESPLIT_WITH_OPERANDS = Object.freeze([Object.freeze({ resplit: true })]);

// A word inside an earlier env's option run is a value, never an env command, so skipping it
// keeps a chain of -S options from being scanned once per env word.
const envSplitWords = (words, index, optionsEnd) => {
  if (basename(words[index].text) !== ENV_WORD || index < optionsEnd) return { words: [], optionsEnd };
  const found = [];
  let cursor = index + 1;
  for (; cursor < words.length && isOption(words[cursor]); cursor += 1) {
    const { split, consumed } = envOption(words, cursor);
    cursor += consumed;
    if (split.length > 0 && cursor + 1 < words.length) return { words: RESPLIT_WITH_OPERANDS, optionsEnd: words.length };
    found.push(...split);
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
  literalOpener: false,
  escapedSyntax: false,
  escapedBracket: false,
  openSubscript: false,
  joinedOpener: false,
  dollarTail: false,
  nameTail: false,
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
  reprinted: false,
  heredocInBody: false,
  closesOnParen: false,
  rereads: new Set(),
  failure: null,
});

// Lone test and group operators are words bash never expands.
const LITERAL_OPERATORS = new Set(['[', '[[', '{']);

// Kept per append so a quote never re-scans the whole word to learn whether a [ is still open.
const tracksSubscript = (open, text) => {
  const lastOpen = text.lastIndexOf(OPEN_BRACKET);
  const lastClose = text.lastIndexOf(CLOSE_BRACKET);
  return lastOpen === lastClose ? open : lastOpen > lastClose;
};

const JOINING_OPENER = /^[({`]/;
const DOLLAR_TAIL = /[$}]$/;
const NAME_TEXT = /^\w+$/;

const appendText = (context, text) => {
  context.piece = (context.piece ?? '') + text;
  context.openSubscript = tracksSubscript(context.openSubscript, text);
};

// Kept per append, never read off the piece, so a long word costs no re-scan.
const tracksDollarTail = (context, text) => {
  if (text === '') return;
  context.nameTail &&= NAME_TEXT.test(text);
  context.dollarTail = context.nameTail || DOLLAR_TAIL.test(text);
};

// A literal ( { or ` after what may end in a $ at run time (a $, any expansion, a brace group) can still join it into an opener.
const append = (context, text) => {
  context.joinedOpener ||= JOINING_OPENER.test(text) && context.dollarTail;
  appendText(context, text);
  tracksDollarTail(context, text);
};

const isHeadWord = (context, { text }) =>
  context.words.length === 0 &&
  (HEAD_WORDS.has(text) ||
    ASSIGNMENT.test(text) ||
    (context.timing && text === TIME_FORMAT_FLAG));

const pushWord = (context, word) => {
  if (context.closesOnParen && word.text === CASE_KEYWORD) return fail(context, CASE_IN_SUBSTITUTION);
  if (!isHeadWord(context, word)) {
    context.words.push(word);
    return;
  }
  if (ASSIGNMENT.test(word.text)) context.assignments.push(word.text);
  context.timing = word.text === TIME_KEYWORD;
};

const LITERAL_OPENER_CHAR = /[$`]/;
const SUBSCRIPT_IN_STRING =
  'craft: command not parseable (a word holding a quoted [ … $( ) — bash may evaluate it as arithmetic and run it) — denied fail-closed';

// bash evaluates a subscript in a string as arithmetic wherever the string is read, and a ] before the opener can close a nested subscript
const bracketBeforeOpener = piece => {
  const bracket = piece.indexOf(OPEN_BRACKET);
  return bracket !== -1 && SUBSTITUTION_OPENER.test(piece.slice(bracket));
};

// An escape hides where its character sits, so with one in the word the order of [ and the opener cannot be read.
const escapeHidesSubscript = context =>
  context.escapedBracket || (context.escapedSyntax && context.piece.includes(OPEN_BRACKET));

const holdsBracket = context => context.escapedBracket || context.piece.includes(OPEN_BRACKET);
const holdsDollar = context => context.literalOpener || context.piece.includes(DOLLAR);
const joinsSubscriptOpener = context => context.joinedOpener && holdsBracket(context);

const holdsSubscriptSubstitution = context =>
  (context.literalOpener && bracketBeforeOpener(context.piece)) ||
  (holdsDollar(context) && (escapeHidesSubscript(context) || joinsSubscriptOpener(context)));

const resetWordFlags = context => {
  context.dynamic = false;
  context.opaque = false;
  context.pattern = false;
  context.literalOpener = false;
  context.escapedSyntax = false;
  context.escapedBracket = false;
  context.openSubscript = false;
  context.joinedOpener = false;
  context.dollarTail = false;
  context.nameTail = false;
};

const endWord = context => {
  if (context.piece === null) return;
  if (holdsSubscriptSubstitution(context)) return fail(context, SUBSCRIPT_IN_STRING);
  const literal = LITERAL_OPERATORS.has(context.piece);
  const word = {
    text: context.piece,
    dynamic: context.dynamic && !literal,
    ...(context.opaque && { opaque: true }),
    ...(context.pattern && !literal && { pattern: true }),
  };
  context.piece = null;
  resetWordFlags(context);
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
  for (const { text, opaque, resplit } of reparsedWords(words)) {
    if (resplit === true) return fail(context, ENV_RESPLIT);
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

// A backslash escapes the next character inside double quotes only, so "\"" is one quoted word.
// equivalent mutant (EqualityOperator at <= source.length): source[source.length] is undefined, so the extra pass falls through to the same source.length
const quoteEnd = (source, index) => {
  const quote = source[index];
  for (let at = index + 1; at < source.length; at += 1) {
    if (quote === DOUBLE_QUOTE && source[at] === BACKSLASH) at += 1;
    else if (source[at] === quote) return at;
  }
  return source.length;
};

const braceSkip = (source, index) => {
  if (source[index] === BACKSLASH) return index + 1;
  return source[index] === SINGLE_QUOTE || source[index] === DOUBLE_QUOTE ? quoteEnd(source, index) : index;
};

// A scan that finds no brace expression proves none exists later in the same word, so
// remembering where it stopped keeps a run of braces linear; a word already marked as a
// pattern needs no further scan.
// equivalent mutant (EqualityOperator index <= source.length): the extra pass sees an undefined character and only moves braceFailedUntil, which gates indices below source.length
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

const SUBSTITUTION_OPENER = /\$\(|\$\{|`/;
const QUOTED_ARITHMETIC_SUBSTITUTION =
  "craft: command not parseable (a quoted $( ), ` or ${ } inside (( )), a subscript or ${ } — bash may still run it) — denied fail-closed";

// (( )), for (( )), any ${ } body and an open [ subscript: bash expands quoted text there again (5.3 everywhere, 3.2 in some).
const inArithmeticReach = context =>
  context.arithmeticFloor !== NO_ARITHMETIC || context.parameter || context.openSubscript;

// A $'…' numeric escape decodes before bash evaluates the text, so \x24, \140 or \x28 is live syntax there.
const ANSI_C_ESCAPE = /\\(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|([0-7]{1,3})|c[\s\S]|[\s\S])/g;
const HEX_RADIX = 16;
const OCTAL_RADIX = 8;
// bash keeps only the low byte of an octal escape, so \444 is a $.
const BYTE_MASK = 0xff;
const codeOf = char => char.codePointAt(0);
const OPENER_CODES = new Set([DOLLAR, BACKTICK].map(codeOf));
const SYNTAX_CODES = new Set([DOLLAR, BACKTICK, OPEN_PAREN, OPEN_BRACE, OPEN_BRACKET].map(codeOf));
const BRACKET_CODE = codeOf(OPEN_BRACKET);
const escapedCode = ([, hex, short, long, octal]) =>
  octal === undefined ? Number.parseInt(hex ?? short ?? long, HEX_RADIX) : Number.parseInt(octal, OCTAL_RADIX) & BYTE_MASK;
const escapedCodes = span => [...span.matchAll(ANSI_C_ESCAPE)].map(escapedCode);
const anyIn = (codes, set) => codes.some(code => set.has(code));

const onBackslash = context => {
  const next = context.source[context.index + 1];
  if (next === undefined) return onLiteral(context);
  if (next !== NEWLINE) append(context, next);
  context.literalOpener ||= next === DOLLAR || next === BACKTICK;
  context.index += 2;
};

const onSingleQuote = context => {
  const close = context.source.indexOf(SINGLE_QUOTE, context.index + 1);
  if (close === -1) return fail(context, UNTERMINATED_QUOTE);
  const span = context.source.slice(context.index + 1, close);
  if (inArithmeticReach(context) && SUBSTITUTION_OPENER.test(span)) return fail(context, QUOTED_ARITHMETIC_SUBSTITUTION);
  context.literalOpener ||= LITERAL_OPENER_CHAR.test(span);
  append(context, span);
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

// equivalent mutant (EqualityOperator context.index <= context.source.length): the extra pass appends to a piece of a context that then fails with the same unterminated-quote reason
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

const inspectAnsiCSpan = (context, span) => {
  const codes = escapedCodes(span);
  const escapesSyntax = anyIn(codes, SYNTAX_CODES);
  if (inArithmeticReach(context) && (SUBSTITUTION_OPENER.test(span) || escapesSyntax)) return fail(context, QUOTED_ARITHMETIC_SUBSTITUTION);
  context.literalOpener ||= LITERAL_OPENER_CHAR.test(span) || anyIn(codes, OPENER_CODES);
  context.escapedSyntax ||= escapesSyntax;
  context.escapedBracket ||= codes.includes(BRACKET_CODE);
};

// equivalent mutant (EqualityOperator context.index <= context.source.length): the extra pass appends to a piece of a context that then fails with the same unterminated-quote reason
const readAnsiC = context => {
  const from = context.index + 2;
  const close = findUnescaped(context.source, from, SINGLE_QUOTE);
  if (close !== -1) inspectAnsiCSpan(context, context.source.slice(from, close));
  if (context.failure !== null) return;
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

// equivalent mutant (ConditionalExpression true, ArithmeticOperator context.index - 1): a backslash ending the source takes either branch and the string is then unterminated, so the parse fails with the same reason
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

const SUBSTITUTION = Object.freeze({ openLength: 2, close: ')', settle: breakCommand, parameter: false, reprinted: true });

const PARAMETER = Object.freeze({ openLength: 2, close: '}', settle: endWord, parameter: true, reprinted: false });

// equivalent mutant (ConditionalExpression false): only parseNested passes a null close, and it ignores the returned flag
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
  appendText(context, context.source.slice(start, end));
  context.dollarTail = true;
  context.nameTail = false;
  context.index = end;
  context.dynamic = true;
};

const isTooDeep = context => context.depth >= MAX_NESTING_DEPTH;

const enterConstruct = (context, { openLength, close, settle, parameter, reprinted }) => {
  if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);
  const start = context.index;
  const child = createContext(context.source, context.depth + 1);
  child.index = start + openLength;
  child.parameter = parameter;
  child.reprinted = reprinted;
  child.closesOnParen = close === ')';
  child.rereads = context.rereads;
  const closed = runBody(child, close);
  settle(child);
  if (child.failure !== null) return fail(context, child.failure);
  if (!closed) return fail(context, UNTERMINATED_SUBSTITUTION);
  absorb(context, child);
  markExpansion(context, start, child.index + 1);
};

// equivalent mutant (EqualityOperator index <= source.length): source[source.length] is undefined, neither a backslash nor the closer, so the result is still -1
const findUnescaped = (source, from, closer) => {
  for (let index = from; index < source.length; index += 1) {
    if (source[index] === BACKSLASH) index += 1;
    else if (source[index] === closer) return index;
  }
  return -1;
};

const enterBacktick = context => {
  if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);
  const start = context.index;
  const end = findUnescaped(context.source, start + 1, BACKTICK);
  if (end === -1) return fail(context, UNTERMINATED_SUBSTITUTION);
  const body = context.source.slice(start + 1, end).replace(BACKTICK_ESCAPES, '$1');
  const child = parseNested(context, body);
  if (child.failure !== null) return fail(context, child.failure);
  absorb(context, child);
  markExpansion(context, start, end + 1);
};

// The body of $(( )) and $[ ] expands like a double-quoted string, and a ) or ] in quotes or after \ does not close it.
const ARITHMETIC_EXPANSION = Object.freeze({ openLength: 3, open: OPEN_PAREN, close: ')', doubledClose: true });
const BRACKET_ARITHMETIC = Object.freeze({ openLength: 2, open: OPEN_BRACKET, close: ']', doubledClose: false });

const ARITHMETIC_SINGLE_QUOTE =
  "craft: command not parseable (a ' inside $(( )) or $[ ] — bash still runs the substitutions in it) — denied fail-closed";
const BODY_OPEN_LEVEL = 1;
// equivalent mutant (UnaryOperator +1, +2 on both sentinels): an end is at least 3 (past the opener and its closer), so any two distinct values below 3 compare the same
const UNCLOSED = -1;
const REREAD_AS_SUBSTITUTION = -2;
const LINE_CONTINUATION = '\\\n';
// bash drops a line continuation before it tells $(( from $( (, a split this tokeniser does not model.
const SPLIT_EXPANSION =
  'craft: command not parseable (a line continuation inside $, ((, $(( or its closing )) ) — denied fail-closed';
// bash re-reads a $(( )) body that does not pair its parens as $( ( … ) ); where that pairing departs from this
// scanner's own (comments, quotes spanning a nested $( )) the two readings disagree, so the guard refuses it.
const UNPAIRED_ARITHMETIC =
  'craft: command not parseable (a $(( )) body with unpaired parens — bash may re-read it as a command substitution) — denied fail-closed';
// equivalent mutant (Regex \\[\S\S] in the first branch): a backslash before whitespace stays, but neither it nor the whitespace is a paren or opens a span
const PAIRING_EXEMPT_SPANS = /\\[\s\S]|'[^']*'|"(?:\\[\s\S]|[^"\\])*"/g;

const skipEscaped = body => {
  body.index += 2;
};

const failArithmeticQuote = body => fail(body, ARITHMETIC_SINGLE_QUOTE);

const levelChange = (char, { open, close }) => {
  if (char === open) return 1;
  if (char === close) return -1;
  return 0;
};

const isPaired = text => {
  let level = 0;
  // equivalent mutant (StringLiteral replacement): any paren-free replacement leaves the count unchanged
  for (const char of text.replace(PAIRING_EXEMPT_SPANS, '')) {
    level += levelChange(char, ARITHMETIC_EXPANSION);
    if (level < 0) return false;
  }
  return level === 0;
};

const failScan = (body, reason) => {
  fail(body, reason);
  return UNCLOSED;
};

const closerEnd = (body, { close, doubledClose }, from) => {
  const after = body.index + 1;
  if (!doubledClose) return after;
  if (body.source.startsWith(LINE_CONTINUATION, after)) return failScan(body, SPLIT_EXPANSION);
  if (body.source[after] !== close) return REREAD_AS_SUBSTITUTION;
  return isPaired(body.source.slice(from, body.index)) ? after + 1 : failScan(body, UNPAIRED_ARITHMETIC);
};

// equivalent mutant (EqualityOperator index <= source.length): the extra pass reads undefined, a literal, and the scan still ends UNCLOSED
const scanArithmeticBody = (body, descriptor) => {
  const from = body.index;
  let level = BODY_OPEN_LEVEL;
  while (body.index < body.source.length && body.failure === null) {
    level += levelChange(body.source[body.index], descriptor);
    if (level === 0) return closerEnd(body, descriptor, from);
    (ARITHMETIC_HANDLERS.get(body.source[body.index]) ?? onLiteral)(body);
  }
  return UNCLOSED;
};

// Every enclosing re-read meets an inner re-read $(( again, so its verdict is kept to keep the work linear in depth.
// equivalent mutant (CallExpression on either line, ConditionalExpression false on the memo check in enterArithmetic): the memo only saves
// work; without the parse, the step loop dispatches the same $(( again, which then takes the memo path to the same verdict
const rereadAsSubstitution = (context, start) => {
  context.rereads.add(start);
  enterConstruct(context, SUBSTITUTION);
};

const enterArithmetic = (context, descriptor) => {
  if (isTooDeep(context)) return fail(context, NESTING_TOO_DEEP);
  const start = context.index;
  if (context.rereads.has(start)) return enterConstruct(context, SUBSTITUTION);
  const body = createContext(context.source, context.depth + 1);
  body.index = start + descriptor.openLength;
  body.rereads = context.rereads;
  const end = scanArithmeticBody(body, descriptor);
  if (body.failure !== null) return fail(context, body.failure);
  if (end === REREAD_AS_SUBSTITUTION) return rereadAsSubstitution(context, start);
  if (end === UNCLOSED) return fail(context, UNTERMINATED_SUBSTITUTION);
  absorb(context, body);
  markExpansion(context, start, end);
};

const afterContinuations = (source, from) => {
  let index = from;
  while (source.startsWith(LINE_CONTINUATION, index)) index += LINE_CONTINUATION.length;
  return index;
};

const enterDollarParen = context => {
  const opener = context.index + 2;
  const next = afterContinuations(context.source, opener);
  if (context.source[next] !== OPEN_PAREN) return enterConstruct(context, SUBSTITUTION);
  if (next > opener) return fail(context, SPLIT_EXPANSION);
  enterArithmetic(context, ARITHMETIC_EXPANSION);
};

const onVariable = context => {
  markExpansion(context, context.index, context.index + 2);
  // The rest of the name arrives as literal text, and the expansion only ends with it.
  context.nameTail = true;
};

const enterBrace = context =>
  FUNCTION_SUBSTITUTION_OPENER.test(context.source[context.index + 2])
    ? fail(context, FUNCTION_SUBSTITUTION_REFUSED)
    : enterConstruct(context, PARAMETER);

const expandDollar = context => {
  if (context.source.startsWith(LINE_CONTINUATION, context.index + 1)) return fail(context, SPLIT_EXPANSION);
  const next = context.source[context.index + 1];
  if (next === OPEN_PAREN) return enterDollarParen(context);
  if (next === OPEN_BRACE) return enterBrace(context);
  if (next === OPEN_BRACKET) return enterArithmetic(context, BRACKET_ARITHMETIC);
  if (next !== undefined && VARIABLE_START.test(next)) return onVariable(context);
  onLiteral(context);
};

const ARITHMETIC_HANDLERS = new Map([
  [BACKSLASH, skipEscaped],
  [DOUBLE_QUOTE, onDoubleQuote],
  [SINGLE_QUOTE, failArithmeticQuote],
  [DOLLAR, expandDollar],
  [BACKTICK, enterBacktick],
]);

// equivalent mutant (CallExpression onDoubleQuote): the step loop hands the double quote left after the skipped $ to the same handler
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

// equivalent mutant (ConditionalExpression false): expandDollar on a $ followed by a single quote falls through to onLiteral as well
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

// equivalent mutant (StringLiteral Stryker was here!): the delimiter text is compared only when a body line is read, and a backslash ending the source leaves no newline after it
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

// equivalent mutant (EqualityOperator context.index <= context.source.length): the extra pass only lengthens a delimiter that ends the source, where no body line follows to match it
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

// equivalent mutant (StringLiteral Stryker was here!): neither the empty string nor the replacement is a file descriptor
// equivalent mutant (CallExpression endWord): the delimiter ends at a character that flushes the word and onHeredoc leaves redirecting untouched, so the deferred flush emits the same word
// equivalent mutant (ConditionalExpression true on the failure guard): a failed context discards its heredocs with the whole parse
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
  if (context.reprinted) context.heredocInBody = true;
};

// bash 5.3 reprints a substitution body and drops the first ; after a heredoc there, merging two commands.
const onSemicolon = context =>
  context.heredocInBody ? fail(context, HEREDOC_LIST_IN_SUBSTITUTION) : onBreak(context);

// equivalent mutant (ArrayDeclaration seeded line): the seed holds no expansion, so scanning the body finds nothing more
// equivalent mutant (ConditionalExpression false, UnaryOperator +1): without a final newline the index lands at or one past the end of the source, and both stop every loop
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

// equivalent mutant (EqualityOperator scratch.index <= body.length): the extra pass consumes an undefined literal and records no command or failure
// equivalent mutant (ConditionalExpression true on the failure guard): fail with a null reason leaves the failure unset
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

// equivalent mutant (ConditionalExpression true): fail keeps the first reason and the parse is discarded, so scanning later bodies changes nothing
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

// equivalent mutant (StringLiteral Stryker was here!): neither the empty string nor the replacement is a file descriptor
const onRedirect = context => {
  if (FILE_DESCRIPTOR.test(context.piece ?? '')) context.piece = null;
  endWord(context);
  context.index += 1;
  if (REDIRECT_SUFFIXES.includes(context.source[context.index])) context.index += 1;
  context.redirecting = true;
};

const OPENS_ARITHMETIC = '((';

// equivalent mutant (ConditionalExpression true, EqualityOperator context.index >= 0 on the index guard): at index 0 parens is 0, so an adjacent match there sets the floor to parens - 1, which is NO_ARITHMETIC
const onOpenParen = context => {
  const next = afterContinuations(context.source, context.index + 1);
  if (next > context.index + 1 && context.source[next] === OPEN_PAREN) return fail(context, SPLIT_EXPANSION);
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
  [';', onSemicolon],
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
