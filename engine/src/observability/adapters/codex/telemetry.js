/**
 * Codex `codex exec --json` stream binding: `turn.completed` usage envelopes
 * → UsageEvent[].
 *
 * Unlike Copilot's OTel stream (which carries no token counts at all) and
 * unlike Claude/pi/opencode (no double-count hazard here either — there is
 * only one tier of usage record), Codex's `turn.completed.usage` is a
 * genuine, single-tier token source: `{input_tokens, cached_input_tokens,
 * output_tokens, reasoning_output_tokens}`.
 *
 * The parser is envelope-shaped, not location-shaped, and it handles TWO
 * distinct token envelopes, because the live stream and the persisted rollout
 * do NOT share one — a real captured rollout pinned this (fixture
 * `engine/test/fixtures/codex/real-rollout.jsonl`), correcting the earlier
 * assumption that they matched:
 *   - LIVE `codex exec --json`: `turn.completed` carrying `usage:{...}`.
 *   - PERSISTED rollout `.jsonl` (what `--source codex` mines from
 *     `$CODEX_HOME/sessions`): `{type:'event_msg', payload:{type:'token_count',
 *     info:{last_token_usage:{...}, total_token_usage:{...}}}}`. The per-turn
 *     figure is `last_token_usage`; `total_token_usage` is cumulative and
 *     mapping it would double-count.
 * The token field names inside both usage objects are identical, so both feed
 * the same sum-safe `tokensFromCodexUsage`.
 *
 * The session/thread id also arrives differently per envelope: the live stream
 * carries it once on `thread.started`; the persisted rollout carries it once on
 * a `session_meta` record. Either updates the held id (the pi pattern), which is
 * then stamped onto every derived event, since neither repeats it per line.
 *
 * No clock reads, no random, no model-id literals in core paths.
 */

const THREAD_STARTED_TYPE = 'thread.started';
const TURN_COMPLETED_TYPE = 'turn.completed';
const SESSION_META_TYPE = 'session_meta';
const EVENT_MSG_TYPE = 'event_msg';
const TOKEN_COUNT_PAYLOAD_TYPE = 'token_count';
const DEFAULT_MESSAGE_COUNT = 1;

// Coerce non-finite values (string, NaN, null, undefined) to 0 so they can't
// poison downstream cost math.
const numOrZero = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Map a raw Codex `turn.completed.usage` object to the vendor-neutral token
 * shape the core consumes.
 *
 * WHY cacheRead is capped at input_tokens, not passed through raw: whether
 * `cached_input_tokens` is a SUBSET of `input_tokens` (the OpenAI Responses
 * convention Codex speaks) or disjoint from it (the Anthropic convention) is
 * not pinned. Capping `cacheRead` at `input_tokens` and setting
 * `input = input_tokens - cacheRead` guarantees `input + cacheRead` always
 * reconstructs the reported `input_tokens` EXACTLY, for any combination of
 * the two raw fields — under the subset convention this is exact by
 * construction; under the disjoint convention (or malformed/inconsistent
 * data where `cached_input_tokens` exceeds `input_tokens`), only the
 * input/cache-read *attribution* shifts, mis-pricing at the cache rate
 * rather than inventing tokens beyond what Codex reported. Dropping the cap
 * (using raw `cached_input_tokens` as `cacheRead`) would let the two-field
 * sum exceed `input_tokens` whenever the cap would have applied — silently
 * inflating every reported cost figure in exactly that case.
 *
 * `reasoning_output_tokens` gets the mirror treatment: `output` is
 * `output_tokens` alone. If reasoning is a subset of output (the
 * Responses-API convention) this is exact; if disjoint it under-reports,
 * which is the safe direction. Adding the two is the only variant that can
 * over-report, so they are never summed.
 *
 * @param {object} usage - raw Codex turn.completed.usage object
 * @returns {{ input: number, cacheRead: number, cacheCreation: number, output: number }}
 */
export function tokensFromCodexUsage(usage) {
  const inputTokens = numOrZero(usage?.input_tokens);
  const cachedInputTokens = numOrZero(usage?.cached_input_tokens);
  const cacheRead = Math.min(cachedInputTokens, inputTokens);
  return {
    input: inputTokens - cacheRead,
    cacheRead,
    cacheCreation: 0,
    output: numOrZero(usage?.output_tokens),
  };
}

/**
 * Defensive epoch-ms coercion for Codex turn timestamps, whose exact wire
 * encoding is not pinned: a finite number passes through, a Date.parse-able
 * string converts, anything else yields 0 rather than throwing on a shape
 * that was not expected.
 *
 * @param {*} v
 * @returns {number}
 */
function toEpochMs(v) {
  if (Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Derive turn duration in ms from its started_at/completed_at pair. Both
 * fields must be present to attempt a computation; a negative span (clock
 * skew, malformed input) floors to 0 rather than reporting negative cost
 * weight.
 *
 * @param {*} startedAt
 * @param {*} completedAt
 * @returns {number}
 */
function durationMsFrom(startedAt, completedAt) {
  if (startedAt == null || completedAt == null) return 0;
  return Math.max(0, toEpochMs(completedAt) - toEpochMs(startedAt));
}

/**
 * Resolve the thread/session id off a `thread.started` line. Defensive over
 * the exact field name, since it is not pinned beyond "a thread/session id
 * on thread.started".
 *
 * @param {object} parsed
 * @returns {string | null}
 */
function threadIdFrom(parsed) {
  return parsed?.thread_id ?? parsed?.id ?? null;
}

/**
 * Resolve the session id off a persisted-rollout `session_meta` record, whose
 * payload carries it as `session_id` (with `id` as a fallback alias).
 *
 * @param {object} parsed
 * @returns {string | null}
 */
function sessionIdFromMeta(parsed) {
  return parsed?.payload?.session_id ?? parsed?.payload?.id ?? null;
}

/**
 * Track the current session id across the stream: a `thread.started` line (live
 * stream) or a `session_meta` line (persisted rollout) updates it, every other
 * line leaves it unchanged — the pi pattern, since neither envelope repeats the
 * id on its per-turn lines.
 *
 * @param {object} parsed
 * @param {string | null} current
 * @returns {string | null}
 */
function sessionIdAfter(parsed, current) {
  if (parsed?.type === THREAD_STARTED_TYPE) return threadIdFrom(parsed) ?? current;
  if (parsed?.type === SESSION_META_TYPE) return sessionIdFromMeta(parsed) ?? current;
  return current;
}

/**
 * Convert one `turn.completed` line plus the held session id into a
 * UsageEvent.
 *
 * @param {object} turn - a parsed `turn.completed` line
 * @param {string | null} sessionId - the session id held from thread.started
 * @returns {object} UsageEvent
 */
function eventFromTurn(turn, sessionId) {
  return {
    run: sessionId,
    slug: null,
    phase: null,
    role: null,
    model: turn?.model ?? null,
    tokens: tokensFromCodexUsage(turn?.usage),
    cacheCreationTtl: null,
    messages: DEFAULT_MESSAGE_COUNT,
    durationMs: durationMsFrom(turn?.started_at, turn?.completed_at),
  };
}

/**
 * Whether a parsed line is a persisted-rollout token record —
 * `{type:'event_msg', payload:{type:'token_count'}}`.
 *
 * @param {object} parsed
 * @returns {boolean}
 */
function isTokenCountRecord(parsed) {
  return parsed?.type === EVENT_MSG_TYPE && parsed?.payload?.type === TOKEN_COUNT_PAYLOAD_TYPE;
}

/**
 * Convert one persisted-rollout `token_count` record plus the held session id
 * into a UsageEvent. Maps `info.last_token_usage` (the per-turn figure) — never
 * `total_token_usage`, which is cumulative and would double-count across a
 * multi-turn rollout. The record carries no per-turn model id or start/end
 * timestamps, so `model` is null and `durationMs` is 0.
 *
 * @param {object} parsed - a parsed `event_msg`/`token_count` line
 * @param {string | null} sessionId
 * @returns {object} UsageEvent
 */
function eventFromTokenCount(parsed, sessionId) {
  return {
    run: sessionId,
    slug: null,
    phase: null,
    role: null,
    model: null,
    tokens: tokensFromCodexUsage(parsed?.payload?.info?.last_token_usage),
    cacheCreationTtl: null,
    messages: DEFAULT_MESSAGE_COUNT,
    durationMs: 0,
  };
}

/**
 * Whether a raw timestamp predates the `since` cutoff. Both sides are normalised
 * to epoch ms before comparing — `ts` may be numeric or an ISO string (see
 * `toEpochMs`), and comparing a raw numeric `ts` against a raw ISO `since` string
 * coerces the string to NaN, silently failing the cutoff open. A null/absent `ts`
 * never predates the cutoff. Equal timestamps are NOT "before" — the boundary is
 * inclusive.
 *
 * @param {number|string|null} ts - a raw timestamp (epoch ms or ISO string)
 * @param {string} since - ISO timestamp cutoff
 * @returns {boolean}
 */
function tsBeforeCutoff(ts, since) {
  if (ts == null) return false;
  return toEpochMs(ts) < toEpochMs(since);
}

/**
 * Whether a `turn.completed` line predates the cutoff, keyed off its `started_at`.
 *
 * @param {object} turn
 * @param {string} since - ISO timestamp cutoff
 * @returns {boolean}
 */
function isBeforeCutoff(turn, since) {
  return tsBeforeCutoff(turn.started_at ?? null, since);
}

/**
 * Parse an async iterable of raw JSON-lines into UsageEvents, handling BOTH the
 * live `codex exec --json` stream (`turn.completed`) and the persisted rollout
 * envelope (`event_msg`/`token_count`) — see the module header for why they
 * differ.
 *
 * Malformed lines (not valid JSON) are skipped and counted in `skipped`. Lines
 * that are neither a `turn.completed` nor a `token_count` envelope —
 * `thread.started` / `session_meta` (handled separately, for the held session
 * id), `turn.started`, `item.completed`, and every other rollout record type —
 * contribute no event and are NOT counted as malformed; that exclusion IS the
 * handling, not a swallowed defect.
 *
 * The `since` cutoff is an ISO timestamp string. When set, a turn whose
 * `started_at` (live) or a token_count record whose `timestamp` (persisted)
 * predates the cutoff is silently dropped (internal filtering only — never
 * emitted, redaction-safe).
 *
 * Codex emits no auto-skip signal text for the parser to scan — `markers`
 * is always `[]`.
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
    if (parsed?.type === TURN_COMPLETED_TYPE) {
      if (since && isBeforeCutoff(parsed, since)) continue;
      events.push(eventFromTurn(parsed, sessionId));
      continue;
    }
    if (isTokenCountRecord(parsed)) {
      if (since && tsBeforeCutoff(parsed.timestamp, since)) continue;
      events.push(eventFromTokenCount(parsed, sessionId));
    }
  }
  return { events, skipped, markers: [] };
}
