/**
 * Driver-state grammar — pure, no I/O.
 *
 * Builds the status lines a driven run reports and strips `--policy` flags
 * from a prompt so a driver cannot smuggle policy overrides through it.
 */

/** @type {ReadonlyArray<string>} */
export const STATUS_VERBS = Object.freeze(['FINISHED', 'BLOCKED']);

export const MAX_REASON_CHARS = 240;

const URL_RE = /^https?:\/\/\S+$/;
const PHASE_ID_RE = /^[a-z][a-z0-9-]*$/;
const POLICY_FLAG = '--policy';
const POLICY_FLAG_INLINE_PREFIX = '--policy=';
const WHITESPACE_RUN = /\s+/g;
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
  const collapsed = reason.replace(WHITESPACE_RUN, ' ').trim();
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

/**
 * Bare `--policy` / `--policy=…` whitespace-delimited tokens in `text`.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function findBarePolicyTokens(text) {
  return text.split(WHITESPACE_RUN).filter(isFlag);
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
