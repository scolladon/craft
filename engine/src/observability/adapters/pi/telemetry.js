/**
 * pi JSON-lines binding: `pi --mode json` events → UsageEvent[].
 *
 * Converts a raw pi event stream into the same vendor-neutral UsageEvent
 * shape consumed by the usage-aggregate core (reused unchanged). Unlike the
 * claude/opencode streams, pi's per-turn message lines do not repeat the
 * session id — it is carried once on a header line and must be held across
 * the stream and stamped onto every event derived from later lines. pi has
 * no subagent attribution field, so role is always null and phase is left
 * for the caller to inject (not yet wired here).
 *
 * No clock reads, no random, no model-id literals in core paths.
 */

const SYNTHETIC_MODEL = '<synthetic>';
const SESSION_LINE_TYPE = 'session';
const MESSAGE_END_TYPE = 'message_end';
const DEFAULT_MESSAGE_COUNT = 1;

// Coerce non-finite values (string, NaN, null, undefined) to 0 so they can't
// poison downstream cost math.
const numOrZero = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Map a raw pi `message.usage` object to the vendor-neutral token shape the
 * core consumes. pi's cache-write is the cache-creation equivalent.
 *
 * @param {object} usage - Raw pi message.usage object
 * @returns {{ input: number, cacheRead: number, cacheCreation: number, output: number }}
 */
export function tokensFromPiUsage(usage) {
  return {
    input: numOrZero(usage?.input),
    cacheRead: numOrZero(usage?.cacheRead),
    cacheCreation: numOrZero(usage?.cacheWrite),
    output: numOrZero(usage?.output),
  };
}

/**
 * Convert one assistant message_end's `message` payload plus the
 * held session id into a UsageEvent. Returns null for a synthetic-model
 * message (zero-cost injected turn).
 *
 * @param {object} message - the `message` object from a message_end line
 * @param {string | null} sessionId - the session id held from the header line
 * @returns {object | null} UsageEvent or null
 */
export function eventFromPiMessage(message, sessionId) {
  // equivalent mutant (message?.model → message.model): the only call site
  // (parseLines) reaches here after isUsageBearingLine confirms
  // parsed?.message?.usage != null, so message is guaranteed non-null.
  const model = message?.model ?? null;
  if (model === SYNTHETIC_MODEL) return null;

  return {
    run: sessionId,
    slug: null,
    phase: null,
    role: null,
    model,
    // equivalent mutant (message?.usage → message.usage): same guarantee as
    // message?.model above — message is non-null at this call site.
    tokens: tokensFromPiUsage(message?.usage),
    cacheCreationTtl: null,
    messages: DEFAULT_MESSAGE_COUNT,
    durationMs: 0,
  };
}

/**
 * Determine whether a parsed line is an assistant message_end carrying usage.
 *
 * @param {object} parsed
 * @returns {boolean}
 */
function isUsageBearingLine(parsed) {
  // equivalent mutant (parsed?.message → parsed.message, dropping the first
  // ?.): the && short-circuits on the first clause, so this only evaluates
  // when parsed?.type === MESSAGE_END_TYPE is true, which is only reachable
  // when parsed is non-nullish — parsed.message can never throw here.
  return parsed?.type === MESSAGE_END_TYPE && parsed?.message?.usage != null;
}

/**
 * Track the current session id across the stream: a session-header line
 * updates it, every other line leaves it unchanged.
 *
 * @param {object} parsed
 * @param {string | null} current
 * @returns {string | null}
 */
function sessionIdAfter(parsed, current) {
  return parsed?.type === SESSION_LINE_TYPE ? (parsed.id ?? current) : current;
}

/**
 * Parse an async iterable of raw JSONL lines (from `pi --mode json`) into
 * UsageEvents.
 *
 * Malformed lines (not valid JSON) are skipped and counted in `skipped`.
 * Synthetic-model messages are excluded (zero-cost, not attributable). The
 * session id is stateful: held from the header line and stamped on every
 * later event, since pi's message lines do not repeat it.
 *
 * The `since` cutoff is an ISO timestamp string. When set, message_end lines
 * whose top-level `timestamp` field predates the cutoff are silently dropped
 * (used for internal filtering only — never emitted, redaction-safe).
 *
 * pi has no auto-skip signal text to scan — `markers` is always `[]`.
 *
 * @param {AsyncIterable<string>} lines - Line stream
 * @param {string | null} [since] - ISO timestamp cutoff (inclusive lower bound)
 * @returns {Promise<{ events: object[], skipped: number, markers: object[] }>}
 */
export async function parseLines(lines, since = null) {
  const events = [];
  let skipped = 0;
  let sessionId = null;
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      skipped++;
      continue;
    }
    sessionId = sessionIdAfter(parsed, sessionId);
    if (!isUsageBearingLine(parsed)) continue;
    // equivalent mutant (if (since) → if (true)) and (ts !== null && ... →
    // true && ...): `since` and `ts` are always an ISO timestamp string or
    // null here, never a raw number. `x < isoString` coerces via ToNumber,
    // and ToNumber of an ISO date string is NaN, so any `<` comparison
    // against it (including 0 < NaN from `ToNumber(null)`) is always false —
    // entering the block or dropping the null guard changes no observable
    // output for this domain's timestamp shapes.
    if (since) {
      const ts = parsed.timestamp ?? null;
      if (ts !== null && ts < since) continue;
    }
    const event = eventFromPiMessage(parsed.message, sessionId);
    if (event !== null) events.push(event);
  }
  return { events, skipped, markers: [] };
}
