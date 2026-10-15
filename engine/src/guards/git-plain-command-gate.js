/**
 * Binding-neutral gate: a command that mentions git must be spelled plainly, so a
 * binding that cannot trust a shell parse never has to reason about expansions,
 * evaluators or config injection near git. Character-level and linear time; it
 * depends on no shell tokeniser.
 */
export const COMPLEX_NEAR_GIT_REASON = 'craft: command too complex to verify near git — spell it plainly';

const BLOCKED = Object.freeze({ block: true, reason: COMPLEX_NEAR_GIT_REASON });
const ALLOWED = Object.freeze({ block: false });

const GIT_MENTION = /git/i;
const GIT_CONFIG_INJECTION = /GIT_CONFIG_/i;
const PLAIN_OUTSIDE_QUOTES = /^[A-Za-z0-9 \t_./:=@%+,~^-]$/;
const WORD_BREAKS = new Set([' ', '\t', '\n', ';', '|', '&', '>']);
const DOUBLE_QUOTE_FORBIDDEN = new Set(['$', '`', '\\', '!']);
const SINGLE_QUOTE_FORBIDDEN = /[$`]/;
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const QUOTES = new Set([SINGLE_QUOTE, DOUBLE_QUOTE]);
const OPAQUE_WORD_PART = '"';
const WRAPPER_WORDS = new Set([
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'eval', 'env', 'exec', 'command', 'nohup',
  'time', 'sudo', 'nice', 'timeout', 'xargs', 'source', '.',
  'trap', 'hash', 'builtin', 'enable', 'fc', 'coproc', 'alias',
]);

const IDIOM_HEADER_SOURCE = /"\$\(cat <<'([A-Za-z_][A-Za-z0-9_]*)'\n/.source;
const IDIOM_OPEN = '"$(cat <<\'';
const IDIOM_CLOSE = ')"';

// Bash ends the heredoc at the first line equal to the delimiter, so only that line may close the idiom.
function closingEnd(command, from, delimiter) {
  for (let lineStart = from; lineStart < command.length; ) {
    const lineEnd = command.indexOf('\n', lineStart);
    if (lineEnd === -1) return -1;
    if (command.slice(lineStart, lineEnd) === delimiter) {
      return command.startsWith(IDIOM_CLOSE, lineEnd + 1) ? lineEnd + 1 + IDIOM_CLOSE.length : -1;
    }
    lineStart = lineEnd + 1;
  }
  return -1;
}

// Returns the index just past the idiom, or -1 when the text at `index` is not the idiom.
function idiomEndAt(command, index) {
  if (!command.startsWith(IDIOM_OPEN, index)) return -1;
  const headerPattern = new RegExp(IDIOM_HEADER_SOURCE, 'y');
  headerPattern.lastIndex = index;
  const header = headerPattern.exec(command);
  return header === null ? -1 : closingEnd(command, headerPattern.lastIndex, header[1]);
}

function doubleQuotedEnd(command, from) {
  for (let index = from; index < command.length; index++) {
    if (command[index] === DOUBLE_QUOTE) return index + 1;
    if (DOUBLE_QUOTE_FORBIDDEN.has(command[index])) return -1;
  }
  return -1;
}

// Builtins such as trap, let and declare -i evaluate single-quoted text, so it may not expand anything.
function singleQuotedEnd(command, from) {
  const closeAt = command.indexOf(SINGLE_QUOTE, from);
  if (closeAt === -1) return -1;
  return SINGLE_QUOTE_FORBIDDEN.test(command.slice(from, closeAt)) ? -1 : closeAt + 1;
}

// Returns the index past the quoted run, or -1 when it is unterminated or not data.
function quotedEnd(command, index) {
  const from = index + 1;
  return command[index] === SINGLE_QUOTE ? singleQuotedEnd(command, from) : doubleQuotedEnd(command, from);
}

function quoteChunk(command, index) {
  const idiomEnd = command[index] === DOUBLE_QUOTE ? idiomEndAt(command, index) : -1;
  if (idiomEnd !== -1) return { end: idiomEnd, text: OPAQUE_WORD_PART };
  const end = quotedEnd(command, index);
  return end === -1 ? null : { end, text: command.slice(index + 1, end - 1) };
}

// The piece of text starting at `index`: a quoted run, a word break (text null) or one plain character.
function chunkAt(command, index) {
  const char = command[index];
  if (QUOTES.has(char)) return quoteChunk(command, index);
  if (WORD_BREAKS.has(char)) return { end: index + 1, text: null };
  return PLAIN_OUTSIDE_QUOTES.test(char) ? { end: index + 1, text: char } : null;
}

const COMMAND_SEPARATORS = new Set([';', '|', '&', '\n']);
const REDIRECT = '>';
const REDIRECT_JOINERS = new Set(['&', '|']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
const FILE_DESCRIPTOR = /^[0-9]+$/;
const KEEPS_COMMAND_POSITION = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', 'time']);

const isWrapperWord = word => WRAPPER_WORDS.has(word.split('/').pop().toLowerCase());
const holdsOpaquePart = word => word.includes(OPAQUE_WORD_PART);
const isOpaqueCommand = word => isWrapperWord(word) || holdsOpaquePart(word);
const keepsCommandPosition = word => ASSIGNMENT.test(word) || KEEPS_COMMAND_POSITION.has(word);

const startingState = () => ({ atCommand: true, redirect: false });

// `>&` and `>|` belong to the redirect operator, so the character after `>` does not end the command.
function onBreak(state, char, previous) {
  if (previous === REDIRECT && REDIRECT_JOINERS.has(char)) return state;
  if (COMMAND_SEPARATORS.has(char)) return startingState();
  return char === REDIRECT ? { ...state, redirect: true } : state;
}

// A redirect target is not the command; an assignment or reserved word leaves the command still to come.
function onWord(state, word) {
  if (state.redirect) return { state: { ...state, redirect: false }, word: null };
  if (!state.atCommand) return { state, word: null };
  return { state: { ...state, atCommand: keepsCommandPosition(word) }, word };
}

function closeWord(state, word, breakChar, found) {
  if (word === '') return state;
  if (breakChar === REDIRECT && FILE_DESCRIPTOR.test(word)) return state;
  found.words.push(word);
  const result = onWord(state, word);
  if (result.word !== null) found.commands.push(result.word);
  return result.state;
}

// Returns every word and those in command position, or null as soon as something outside plain text is met.
function commandWords(command) {
  const found = { words: [], commands: [] };
  let state = startingState();
  let word = '';
  for (let index = 0; index < command.length; ) {
    const chunk = chunkAt(command, index);
    if (chunk === null) return null;
    if (chunk.text !== null) word += chunk.text;
    else {
      state = onBreak(closeWord(state, word, command[index], found), command[index], command[index - 1]);
      word = '';
    }
    index = chunk.end;
  }
  closeWord(state, word, null, found);
  return found;
}

const GIT_ENVIRONMENT_ASSIGNMENT = /^GIT_[A-Z0-9_]*=/i;
const CONFIG_FLAGS = new Set(['-c', '--config-env']);
const ATTACHED_CONFIG = /^(?:--config-env=|-c)(.+)$/is;
const SAFE_CONFIG_KEYS = Object.freeze(new Set([
  'user.name', 'user.email', 'commit.gpgsign', 'tag.gpgsign', 'core.quotepath',
  'color.ui', 'init.defaultbranch', 'format.pretty', 'diff.noprefix',
]));
const SAFE_CONFIG_PREFIXES = Object.freeze(['color.', 'advice.', 'log.']);
const PAGER_KEY_PREFIX = 'pager.';
const PAGER_OFF_VALUE = 'false';

const splitAssignment = assignment => {
  const at = assignment.indexOf('=');
  return at === -1
    ? { key: assignment.toLowerCase(), value: null }
    : { key: assignment.slice(0, at).toLowerCase(), value: assignment.slice(at + 1) };
};

function isSafeConfig(assignment) {
  const { key, value } = splitAssignment(assignment);
  if (SAFE_CONFIG_KEYS.has(key)) return true;
  if (SAFE_CONFIG_PREFIXES.some(prefix => key.startsWith(prefix))) return true;
  return key.startsWith(PAGER_KEY_PREFIX) && value === PAGER_OFF_VALUE;
}

// A flag with no operand yields undefined, which is not a safe config.
function configOperands(words) {
  const operands = [];
  words.forEach((word, index) => {
    if (CONFIG_FLAGS.has(word)) operands.push(words[index + 1]);
    const attached = ATTACHED_CONFIG.exec(word);
    if (attached !== null) operands.push(attached[1]);
  });
  return operands;
}

const hasUnsafeConfig = words =>
  words.some(word => GIT_ENVIRONMENT_ASSIGNMENT.test(word)) ||
  configOperands(words).some(operand => operand === undefined || !isSafeConfig(operand));

/**
 * @param {string} command raw shell command
 * @returns {{ block: boolean, reason?: string }}
 */
export function gitPlainCommandGate(command) {
  if (!GIT_MENTION.test(command)) return ALLOWED;
  if (GIT_CONFIG_INJECTION.test(command)) return BLOCKED;
  const words = commandWords(command);
  if (words === null || words.commands.some(isOpaqueCommand)) return BLOCKED;
  return hasUnsafeConfig(words.words) ? BLOCKED : ALLOWED;
}
