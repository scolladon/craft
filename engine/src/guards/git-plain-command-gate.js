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
// equivalent mutant (Regex anchors): it only ever tests one UTF-16 unit, so ^ and $ cannot change the verdict.
const PLAIN_OUTSIDE_QUOTES = /^[A-Za-z0-9 \t_./:=@%+,~^-]$/;
const WORD_BREAKS = new Set([' ', '\t', '\n', ';', '|', '&', '>']);
const DOUBLE_QUOTE_FORBIDDEN = new Set(['$', '`', '\\', '!']);
const SINGLE_QUOTE_FORBIDDEN = /[$`]/;
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const QUOTES = new Set([SINGLE_QUOTE, DOUBLE_QUOTE]);
// Wrappers are an open set, so a shell or evaluator is denied at any word position, not only after a known wrapper.
const SHELL_OR_EVALUATOR_WORDS = Object.freeze(new Set([
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'csh', 'tcsh', 'mksh', 'yash', 'busybox', 'eval',
]));
const WRAPPER_WORDS = Object.freeze(new Set([
  'env', 'exec', 'command', 'nohup', 'time', 'sudo', 'nice', 'timeout', 'xargs', 'source', '.',
  'trap', 'hash', 'builtin', 'enable', 'fc', 'coproc', 'alias',
]));

function doubleQuotedEnd(command, from) {
  // equivalent mutant (EqualityOperator <=): command[length] is undefined, matches neither test, and the loop then returns -1 anyway.
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
  const end = quotedEnd(command, index);
  // equivalent mutant (ConditionalExpression false, UnaryOperator +1): an end of -1 sends the next chunkAt to command[-1], undefined, which is not plain and yields null.
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
// equivalent mutant (StringLiteral "" for 'time'): a command-position `time` is also a wrapper word, so it blocks before this set is consulted.
const KEEPS_COMMAND_POSITION = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', 'time']);

const baseName = word => word.split('/').pop().toLowerCase();
const isWrapperWord = word => WRAPPER_WORDS.has(baseName(word)) || SHELL_OR_EVALUATOR_WORDS.has(baseName(word));
const isShellOrEvaluator = word => SHELL_OR_EVALUATOR_WORDS.has(baseName(word));
// A literal double quote in a command name can only come from a quoting trick, so the gate cannot tell what command runs.
const holdsDoubleQuote = word => word.includes(DOUBLE_QUOTE);
// A command name opening with `=` is a zsh expansion to a path, not the word as written.
const ZSH_EQUALS = '=';
const isZshEqualsExpansion = word => word.startsWith(ZSH_EQUALS);
const isOpaqueCommand = word => isWrapperWord(word) || holdsDoubleQuote(word) || isZshEqualsExpansion(word);
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
  // equivalent mutant (ArrayDeclaration ["Stryker was here"]): that sentinel matches no shell, wrapper, opaque, GIT_ assignment or config predicate.
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
// equivalent mutant (Regex without $): under the s flag a greedy (.+) already reaches the end, where $ holds.
const ATTACHED_CONFIG = /^(?:--config-env=|-c)(.+)$/is;
const SAFE_CONFIG_KEYS = Object.freeze(new Set([
  'user.name', 'user.email', 'commit.gpgsign', 'tag.gpgsign', 'core.quotepath',
  // equivalent mutant (StringLiteral "" for 'color.ui'): the 'color.' prefix below already accepts it.
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
  if (words === null || words.commands.some(isOpaqueCommand) || words.words.some(isShellOrEvaluator)) return BLOCKED;
  return hasUnsafeConfig(words.words) ? BLOCKED : ALLOWED;
}
