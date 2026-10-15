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
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
const QUOTES = new Set([SINGLE_QUOTE, DOUBLE_QUOTE]);
const OPAQUE_WORD_PART = '"';
const WRAPPER_WORDS = new Set([
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'eval', 'env', 'exec', 'command', 'nohup',
  'time', 'sudo', 'nice', 'timeout', 'xargs', 'source', '.',
]);

const IDIOM_HEADER = /"\$\(cat <<'([A-Za-z_][A-Za-z0-9_]*)'\n/y;
const IDIOM_OPEN = '"$(cat <<\'';

// Returns the index just past the idiom, or -1 when the text at `index` is not the idiom.
function idiomEndAt(command, index) {
  if (!command.startsWith(IDIOM_OPEN, index)) return -1;
  IDIOM_HEADER.lastIndex = index;
  const header = IDIOM_HEADER.exec(command);
  if (header === null) return -1;
  const closing = `\n${header[1]}\n)"`;
  const closeAt = command.indexOf(closing, IDIOM_HEADER.lastIndex - 1);
  return closeAt === -1 ? -1 : closeAt + closing.length;
}

function doubleQuotedEnd(command, from) {
  for (let index = from; index < command.length; index++) {
    if (command[index] === DOUBLE_QUOTE) return index + 1;
    if (DOUBLE_QUOTE_FORBIDDEN.has(command[index])) return -1;
  }
  return -1;
}

function singleQuotedEnd(command, from) {
  const closeAt = command.indexOf(SINGLE_QUOTE, from);
  return closeAt === -1 ? -1 : closeAt + 1;
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

const isWrapperWord = word => WRAPPER_WORDS.has(word.split('/').pop().toLowerCase());

// Returns the unquoted words, or null as soon as something outside plain text is met.
function plainWords(command) {
  const words = [];
  let word = '';
  let index = 0;
  while (index < command.length) {
    const chunk = chunkAt(command, index);
    if (chunk === null) return null;
    if (chunk.text !== null) {
      word += chunk.text;
    } else if (word !== '') {
      words.push(word);
      word = '';
    }
    index = chunk.end;
  }
  return word === '' ? words : [...words, word];
}

/**
 * @param {string} command raw shell command
 * @returns {{ block: boolean, reason?: string }}
 */
export function gitPlainCommandGate(command) {
  if (!GIT_MENTION.test(command)) return ALLOWED;
  if (GIT_CONFIG_INJECTION.test(command)) return BLOCKED;
  const words = plainWords(command);
  return words === null || words.some(isWrapperWord) ? BLOCKED : ALLOWED;
}
