/**
 * Copilot OTel file-exporter binding: `COPILOT_OTEL_FILE_EXPORTER_PATH`
 * JSON-lines → UsageEvent[].
 *
 * The exporter writes a MIXED stream: OTLP span records and metric records.
 * The same token totals appear on THREE tiers — leaf `chat <model>` spans,
 * the parent `invoke_agent` span (rolled-up sums of its children), and the
 * `gen_ai.client.token.usage` metric record. Ingesting every token-bearing
 * record inflates reported cost ~3x, so only the leaf `chat` spans are
 * counted; the other two tiers are excluded structurally — never by `name`
 * alone, since metric and span names overlap in the `gen_ai.*` namespace.
 *
 * No clock reads, no random, no model-id literals in core paths.
 */

const COPILOT_SCOPE = 'github.copilot';
const CHAT_OPERATION = 'chat';
const DEFAULT_MESSAGE_COUNT = 1;

// Coerce non-finite values (string, NaN, null, undefined) to 0 so they can't
// poison downstream cost math.
const numOrZero = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Structural span discriminator: a record is an OTel SPAN (as opposed to a
 * metric record) only when it carries both `kind` and an
 * `instrumentationScope.name` of the Copilot vendor scope. Metric records
 * carry neither field — this check never inspects `name`, since metric and
 * span names overlap in the `gen_ai.*` namespace.
 *
 * @param {object} record
 * @returns {boolean}
 */
function isCopilotSpan(record) {
  // equivalent mutant (record.instrumentationScope, optional chaining on `record` dropped): only
  // reached when `record?.kind != null` is true, which already requires record to be non-nullish —
  // the dropped `?.` can never short-circuit, so `record.instrumentationScope` cannot throw.
  return record?.kind != null && record?.instrumentationScope?.name === COPILOT_SCOPE;
}

/**
 * A `chat` span is the leaf tier that carries per-call (not rolled-up) token
 * counts. `invoke_agent` parents sum their children's totals, so counting
 * anything but the leaf tier double- or triple-counts the same tokens.
 *
 * @param {object} record
 * @returns {boolean}
 */
function isChatSpan(record) {
  // equivalent mutant (record.attributes, optional chaining on `record` dropped): isChatSpan is
  // only called after isCopilotSpan(record) returned true, which already guarantees record is
  // non-nullish.
  return record?.attributes?.['gen_ai.operation.name'] === CHAT_OPERATION;
}

/**
 * Defensive epoch-ms coercion for OTel span timestamps, whose exact wire
 * encoding under a live GitHub-routed run is not pinned: a finite number
 * passes through, a Date.parse-able string converts, anything else yields 0
 * rather than throwing on a shape that was not expected.
 *
 * @param {*} v
 * @returns {number}
 */
function toEpochMs(v) {
  if (Number.isFinite(v)) return v;
  // equivalent mutant (ConditionalExpression: `typeof v === 'string'` → `true`): v only ever
  // reaches here as JSON.parse output — number/string/boolean/null/object/array — never a Date
  // instance. Date.parse ToString-coerces any non-string via `String(v)`, which yields unparseable
  // text ("null", "true", "[object Object]", ...) for every non-string JSON shape, so `parsed` is
  // NaN and falls through to `return 0` exactly as the un-mutated branch would.
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Derive span duration in ms from its startTime/endTime pair. Both fields
 * must be present to attempt a computation; a negative span (clock skew,
 * malformed input) floors to 0 rather than reporting negative cost weight.
 *
 * @param {*} startTime
 * @param {*} endTime
 * @returns {number}
 */
function durationMsFrom(startTime, endTime) {
  // equivalent mutant (startTime == null || false, the `endTime == null` arm forced false): only
  // diverges when endTime is null/undefined and startTime is present — but toEpochMs(null/
  // undefined) is 0, so Math.max(0, 0 - toEpochMs(startTime)) floors to 0, identical to the
  // original's early `return 0`.
  if (startTime == null || endTime == null) return 0;
  return Math.max(0, toEpochMs(endTime) - toEpochMs(startTime));
}

/**
 * Convert one `chat` span record into a UsageEvent.
 *
 * @param {object} record - a parsed OTel span record already confirmed to be a `chat` span
 * @returns {object} UsageEvent
 */
function eventFromChatSpan(record) {
  const attributes = record.attributes ?? {};
  return {
    run: attributes['gen_ai.conversation.id'] ?? null,
    slug: null,
    phase: null,
    role: null,
    model: attributes['gen_ai.response.model'] ?? attributes['gen_ai.request.model'] ?? null,
    tokens: {
      input: numOrZero(attributes['gen_ai.usage.input_tokens']),
      cacheRead: 0,
      cacheCreation: 0,
      output: numOrZero(attributes['gen_ai.usage.output_tokens']),
    },
    cacheCreationTtl: null,
    messages: DEFAULT_MESSAGE_COUNT,
    durationMs: durationMsFrom(record.startTime, record.endTime),
  };
}

/**
 * Whether a record's span predates the `since` cutoff. Both sides are
 * normalised to epoch ms before comparing — `startTime` may be numeric or an
 * ISO string (see `toEpochMs`), and comparing a raw numeric `startTime`
 * against a raw ISO `since` string coerces the string to NaN, silently
 * failing the cutoff open. A record with no `startTime` never predates the
 * cutoff. Equal timestamps are NOT "before" — the boundary is inclusive.
 *
 * @param {object} record
 * @param {string} since - ISO timestamp cutoff
 * @returns {boolean}
 */
function isBeforeCutoff(record, since) {
  const ts = record.startTime ?? null;
  if (ts === null) return false;
  return toEpochMs(ts) < toEpochMs(since);
}

/**
 * Parse an async iterable of raw JSON-lines (from the Copilot OTel file
 * exporter) into UsageEvents.
 *
 * Malformed lines (not valid JSON) are skipped and counted in `skipped`.
 * Records that are not a Copilot `chat` span — metric records,
 * `invoke_agent`/`execute_tool` spans, spans from a foreign instrumentation
 * scope — are excluded from token math without being counted as malformed;
 * that exclusion IS the no-double-count handling, not a swallowed defect.
 *
 * The `since` cutoff is an ISO timestamp string. When set, spans whose
 * `startTime` predates the cutoff are silently dropped (used for internal
 * filtering only — never emitted, redaction-safe).
 *
 * Copilot emits no auto-skip signal text for the parser to scan — `markers`
 * is always `[]`.
 *
 * @param {AsyncIterable<string>} lines - Line stream
 * @param {string | null} [since] - ISO timestamp cutoff (inclusive lower bound)
 * @returns {Promise<{ events: object[], skipped: number, markers: object[] }>}
 */
export async function parseLines(lines, since = null) {
  const events = [];
  let skipped = 0;
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
    if (!isCopilotSpan(parsed) || !isChatSpan(parsed)) continue;
    if (since && isBeforeCutoff(parsed, since)) continue;
    events.push(eventFromChatSpan(parsed));
  }
  return { events, skipped, markers: [] };
}
