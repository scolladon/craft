/**
 * Aider persisted chat transcript (`.aider.chat.history.md`) binding:
 * markdown-line usage cues → UsageEvent[].
 *
 * Unlike Codex/Claude/Copilot, Aider emits no live JSON stream and no
 * structured usage envelope at all — its only usage record is a markdown
 * status line printed after each exchange:
 *   `> Tokens: 781 sent, 19 received.`
 * optionally followed by an unpinned cost clause on paid models:
 *   `> Tokens: 781 sent, 19 received. Cost: $0.02 message, $0.15 session.`
 *
 * The model id and the session-start timestamp are also plain markdown
 * headers rather than envelope fields:
 *   `> Model: ollama_chat/qwen2.5-coder:7b with whole edit format`
 *   `# aider chat started at 2026-07-23 15:57:45`
 * Both are held across lines (the codex thread-id pattern) and stamped onto
 * every event emitted afterward, since neither repeats per token line.
 *
 * Aider transcripts carry no session id at all, so `run` is always null.
 *
 * No clock reads, no random, no model-id literals in core paths.
 */

const TOKEN_LINE_RE = /^> Tokens: (\d+) sent, (\d+) received\./;
const TOKEN_LINE_PREFIX = '> Tokens:';
const MODEL_HEADER_RE = /^> Model: (\S+)/;
// equivalent mutant ($ drop): greedy (.+) already consumes to end-of-line —
// each split line carries no \n — so the trailing $ is redundant.
const SESSION_START_RE = /^# aider chat started at (.+)$/;
const DEFAULT_MESSAGE_COUNT = 1;

// Coerce non-finite values (string, NaN, null, undefined) to 0 so they can't
// poison downstream cost math.
const numOrZero = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Map a raw Aider `sent`/`received` token count pair to the vendor-neutral
 * token shape the core consumes. Aider reports no cache figures at all, so
 * both cache fields are always 0.
 *
 * @param {{ sent: number, received: number }} counts
 * @returns {{ input: number, cacheRead: number, cacheCreation: number, output: number }}
 */
export function tokensFromAiderCounts({ sent, received } = {}) {
  return {
    input: numOrZero(sent),
    cacheRead: 0,
    cacheCreation: 0,
    output: numOrZero(received),
  };
}

/**
 * Defensive epoch-ms coercion: aider timestamps are always strings (the
 * `# aider chat started at` capture and the ISO `since` cutoff), so this is a
 * thin Date.parse wrapper that yields 0 rather than throwing on an
 * unparseable value. The aider session-start header
 * (`2026-07-23 15:57:45`) is a local-naive timestamp — Date.parse reads it as
 * local time, not UTC.
 *
 * @param {*} v
 * @returns {number}
 */
function toEpochMs(v) {
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whether a held session-start timestamp predates the `since` cutoff. A
 * null/absent timestamp (no session-start header seen yet) never predates
 * the cutoff.
 *
 * @param {string | null} startTs
 * @param {string} since - ISO timestamp cutoff
 * @returns {boolean}
 */
function tsBeforeCutoff(startTs, since) {
  if (startTs == null) return false;
  return toEpochMs(startTs) < toEpochMs(since);
}

/**
 * Whether a trimmed line is the session-start header, and if so its captured
 * timestamp string.
 *
 * @param {string} trimmed
 * @returns {string | null}
 */
function sessionStartTsFrom(trimmed) {
  return trimmed.match(SESSION_START_RE)?.[1] ?? null;
}

/**
 * Whether a trimmed line is a Model header, and if so its captured model id
 * (the first non-space token after `> Model: `).
 *
 * @param {string} trimmed
 * @returns {string | null}
 */
function modelIdFrom(trimmed) {
  return trimmed.match(MODEL_HEADER_RE)?.[1] ?? null;
}

/**
 * Convert a matched `> Tokens: N sent, M received.` line plus the held model
 * id into a UsageEvent. Aider carries no session id, no role/phase/slug, and
 * no per-line duration, so those fields are always null/0.
 *
 * @param {RegExpMatchArray} tokenMatch
 * @param {string | null} model
 * @returns {object} UsageEvent
 */
function eventFromTokenLine(tokenMatch, model) {
  return {
    run: null,
    slug: null,
    phase: null,
    role: null,
    model,
    tokens: tokensFromAiderCounts({ sent: Number(tokenMatch[1]), received: Number(tokenMatch[2]) }),
    cacheCreationTtl: null,
    messages: DEFAULT_MESSAGE_COUNT,
    durationMs: 0,
  };
}

/**
 * Coerce a raw line from the async iterable to a trimmed string, tolerating
 * non-string entries (null/undefined/number/object) rather than throwing.
 *
 * @param {*} rawLine
 * @returns {string}
 */
function trimLine(rawLine) {
  // equivalent mutant (?? '' -> ?? "Stryker was here!"): any coerced
  // placeholder string still fails every classifier regex below (none start
  // with `> Tokens:`/`> Model:`/`# aider chat started at`), so events and
  // skipped are unchanged regardless of the fallback literal.
  return String(rawLine ?? '').trim();
}

/**
 * Parse an async iterable of raw markdown lines from a persisted Aider chat
 * transcript into UsageEvents. Aider has no live JSON stream and no
 * structured usage envelope — the only usage record is the `> Tokens:` status
 * line, scanned against the trimmed line with no end anchor so a trailing
 * ` Cost: …` clause on a paid line still yields the event.
 *
 * A line that STARTS `> Tokens:` but does not match the two-integer shape (a
 * `k`/`M`/comma large-count, or the unpinned `Cost:`-only form) is a counted
 * skip, never a silent-zero event.
 *
 * The `since` cutoff is an ISO timestamp string. When set, token lines
 * belonging to a session block whose `# aider chat started at` header
 * predates the cutoff are silently dropped (internal filtering only — never
 * emitted, redaction-safe).
 *
 * Aider emits no auto-skip signal text for the parser to scan — `markers` is
 * always `[]`.
 *
 * @param {AsyncIterable<string>} lines - Line stream
 * @param {string | null} [since] - ISO timestamp cutoff (inclusive lower bound)
 * @returns {Promise<{ events: object[], skipped: number, markers: object[] }>}
 */
export async function parseLines(lines, since = null) {
  const events = [];
  let skipped = 0;
  let currentModel = null;
  let currentStartTs = null;

  for await (const rawLine of lines) {
    const trimmed = trimLine(rawLine);
    // equivalent mutant (remove this guard): an empty line matches none of
    // the classifiers below (token/model/session-start), so it would fall
    // through to the final `startsWith` check and fail that too — no
    // observable difference in events or skipped.
    if (!trimmed) continue;

    const startTs = sessionStartTsFrom(trimmed);
    if (startTs != null) {
      currentStartTs = startTs;
      continue;
    }

    const modelId = modelIdFrom(trimmed);
    if (modelId != null) {
      currentModel = modelId;
      continue;
    }

    const tokenMatch = trimmed.match(TOKEN_LINE_RE);
    if (tokenMatch) {
      if (since && tsBeforeCutoff(currentStartTs, since)) continue;
      events.push(eventFromTokenLine(tokenMatch, currentModel));
      continue;
    }

    if (trimmed.startsWith(TOKEN_LINE_PREFIX)) skipped++;
  }

  return { events, skipped, markers: [] };
}
