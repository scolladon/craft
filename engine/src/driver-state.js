/**
 * Driver-state grammar — pure, no I/O.
 *
 * Builds the status lines a driven run reports and strips `--policy` flags
 * from an elected prompt so pre-approval never travels from one run to the next.
 */

/** @type {ReadonlyArray<string>} */
export const STATUS_VERBS = Object.freeze(['FINISHED', 'BLOCKED']);

export const MAX_REASON_CHARS = 240;

const URL_RE = /^https?:\/\/[\x21-\x7e]+$/;
const PHASE_ID_RE = /^[a-z][a-z0-9-]*$/;
const POLICY_FLAG = '--policy';
const POLICY_FLAG_INLINE_PREFIX = '--policy=';
const WHITESPACE_RUN = /\s+/g;
// A reader that splits on NEL, ESC-sequences or NUL must still see one line.
const UNPRINTABLE = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;
const FORMAT_CHARS = /\p{Cf}/gu;
const DASH_LIKE = /[\p{Pd}\u2212]/gu;
const EDGE_PUNCTUATION = /^[()[\]{}<>.,:;!?]+|[()[\]{}<>.,:;!?]+$/g;
const LOOKALIKE_FLAG = /^-+policy(?:=|$)/;
const SEPARATOR_SPLIT = /(\s+)/;
const LINE_BREAK = /[\n\r]/;
const FLAG_VALUE_MARK = '=';

/**
 * @param {string} prUrl
 * @returns {{ line: string } | { error: string }}
 */
export function finishedLine(prUrl) {
  if (!URL_RE.test(prUrl)) {
    return { error: `invalid PR url: ${JSON.stringify(prUrl)}` };
  }
  return { line: `${STATUS_VERBS[0]} ${prUrl}` };
}

function normalizeReason(reason) {
  const collapsed = reason.replace(UNPRINTABLE, ' ').replace(WHITESPACE_RUN, ' ').trim();
  return [...collapsed].slice(0, MAX_REASON_CHARS).join('').trimEnd();
}

/**
 * @param {string} phaseId
 * @param {string} reason
 * @returns {{ line: string } | { error: string }}
 */
export function blockedLine(phaseId, reason) {
  if (!PHASE_ID_RE.test(phaseId)) {
    return { error: `invalid phase id: ${JSON.stringify(phaseId)}` };
  }
  const text = normalizeReason(reason);
  if (text === '') {
    return { error: 'empty reason' };
  }
  return { line: `${STATUS_VERBS[1]} ${phaseId}: ${text}` };
}

function isFlag(token) {
  return token === POLICY_FLAG || token.startsWith(POLICY_FLAG_INLINE_PREFIX);
}

function isSameLineSeparator(token) {
  return token !== undefined && /^\s+$/.test(token) && !LINE_BREAK.test(token);
}

function consumedUntil(tokens, flagIndex) {
  let next = flagIndex + 1;
  const takesValue =
    tokens[flagIndex] === POLICY_FLAG &&
    isSameLineSeparator(tokens[next]) &&
    tokens[next + 1] !== undefined &&
    tokens[next + 1].includes(FLAG_VALUE_MARK);
  if (takesValue) {
    next += 2;
  }
  return isSameLineSeparator(tokens[next]) ? next + 1 : next;
}

// Wider than the strip on purpose: a token a reader could still take for the
// flag (invisible characters, Unicode dashes, case, glued punctuation) is not
// removed but reported, so the election is withheld rather than published.
function looksLikeFlag(token) {
  const normalized = token
    .replace(FORMAT_CHARS, '')
    .normalize('NFKC')
    .replace(DASH_LIKE, '-')
    .toLowerCase()
    .replace(EDGE_PUNCTUATION, '');
  return LOOKALIKE_FLAG.test(normalized);
}

/**
 * Whitespace-delimited tokens in `text` that read as a `--policy` flag.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function findBarePolicyTokens(text) {
  return text.split(WHITESPACE_RUN).filter(looksLikeFlag);
}

/**
 * Removes policy flags (and their same-line value) from a prompt, keeping
 * line breaks and quoted mentions.
 *
 * @param {string} prompt
 * @returns {{ prompt: string, leftovers: string[] }}
 */
export function stripPolicyFlags(prompt) {
  const tokens = prompt.split(SEPARATOR_SPLIT).filter((t) => t !== '');
  const kept = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isFlag(tokens[i])) {
      kept.push(tokens[i]);
      i += 1;
      continue;
    }
    i = consumedUntil(tokens, i);
  }
  const stripped = kept.join('');
  return { prompt: stripped, leftovers: findBarePolicyTokens(stripped) };
}
