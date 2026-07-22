/**
 * Cursor `cursor-agent -p --output-format json|stream-json` binding: the result
 * envelope's `usage` block → UsageEvent[].
 *
 * The token-bearing record is the LIVE result envelope, NOT the persisted transcript —
 * pinned against a real captured rollout, correcting the assumption that a binding can
 * mine tokens from the persisted files (the persisted≠stream lesson made concrete):
 *   - LIVE `--output-format json`: a single `{type:'result', usage:{inputTokens,
 *     outputTokens, cacheReadTokens, cacheWriteTokens}, session_id, duration_ms}` object
 *     (stream-json emits the same object as the final line). This is the ONLY token source.
 *   - PERSISTED transcript `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl`:
 *     Anthropic-Messages-shaped lines (`{role, message:{content:[…]}}`) plus a terminal
 *     `{type:'turn_ended'}` — and carries NO token figure at all. Those lines are
 *     structural, not malformed: they contribute no event and are NOT counted as skipped
 *     (that exclusion IS the handling). Unlike codex, whose persisted rollout carries a
 *     `token_count` record, Cursor persists none, so a persisted-transcript mine yields
 *     zero token events by design — the craft orchestrator reads tokens from the result
 *     envelope the spawn returns instead.
 *
 * No clock reads, no random, no model-id literals in core paths.
 */

const RESULT_TYPE = 'result';
const DEFAULT_MESSAGE_COUNT = 1;

// Coerce non-finite values (string, NaN, null, undefined) to 0 so they can't poison
// downstream cost math.
const numOrZero = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Map a Cursor result-envelope `usage` object to the vendor-neutral token shape the
 * core consumes.
 *
 * Cursor's four counts are DISJOINT (the Anthropic convention), NOT nested — pinned by
 * the real captured rollout, where `cacheReadTokens` (21760) EXCEEDS `inputTokens` (4646),
 * which is only possible if cache-read is a separate count, not a subset of input. So
 * each field maps DIRECTLY, exactly as the Anthropic-native claude adapter does
 * (`input:input_tokens`, `cacheRead:cache_read_input_tokens`, …) — the aggregator then
 * sums `input + cacheRead + cacheCreation + output` as the total and prices each band.
 * Capping `cacheRead` at `input` (the codex approach, for its OpenAI subset convention)
 * would DESTROY the ~17k cache-read tokens the real rollout reported and understate cost.
 *
 * @param {object} usage - raw Cursor result-envelope usage object
 * @returns {{ input: number, cacheRead: number, cacheCreation: number, output: number }}
 */
export function tokensFromCursorUsage(usage) {
  return {
    input: numOrZero(usage?.inputTokens),
    cacheRead: numOrZero(usage?.cacheReadTokens),
    cacheCreation: numOrZero(usage?.cacheWriteTokens),
    output: numOrZero(usage?.outputTokens),
  };
}

/**
 * Convert one `result` envelope into a UsageEvent. The envelope carries no model id
 * (model is null) and no wall-clock timestamp; `duration_ms` is the turn span.
 *
 * `parsed` is guaranteed a truthy result object here — eventFromResult is only called
 * after the `parsed?.type === RESULT_TYPE && parsed?.usage` guard in parseLines passes.
 * The `?.` on parsed below is therefore defensive over an unreachable null, which is why
 * dropping it changes no observable output (equivalent mutant, OptionalChaining).
 *
 * @param {object} parsed - a parsed `type:'result'` line
 * @returns {object} UsageEvent
 */
function eventFromResult(parsed) {
  return {
    run: parsed?.session_id ?? null,
    slug: null,
    phase: null,
    role: null,
    model: null,
    tokens: tokensFromCursorUsage(parsed?.usage),
    cacheCreationTtl: null,
    messages: DEFAULT_MESSAGE_COUNT,
    durationMs: numOrZero(parsed?.duration_ms),
  };
}

/**
 * Parse an async iterable of raw JSON-lines into UsageEvents.
 *
 * The token source is the `type:'result'` envelope carrying `usage` (from
 * `--output-format json`/`stream-json`). Persisted-transcript lines (`role`/`turn_ended`)
 * carry no tokens and produce no event — structural, not malformed, so not counted as
 * skipped. Only lines that are not valid JSON increment `skipped`.
 *
 * The `since` cutoff is accepted for interface parity with the other source adapters,
 * but Cursor's result envelope carries no per-record wall-clock timestamp (only a
 * `duration_ms` span), so there is nothing to compare it against — the caller filters by
 * file mtime instead. It is therefore a documented no-op here, never a silent drop.
 *
 * Cursor emits no auto-skip signal text for the parser to scan — `markers` is always `[]`.
 *
 * @param {AsyncIterable<string>} lines - Line stream
 * @param {string | null} [since] - accepted for parity; a documented no-op (see above)
 * @returns {Promise<{ events: object[], skipped: number, markers: object[] }>}
 */
// eslint-disable-next-line no-unused-vars -- `since` is part of the shared parseLines signature; see doc above.
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
    // The first `?.` (parsed?.type) is load-bearing: a `null` line (JSON.parse('null'))
    // would throw without it — covered by the null-line test. The second `?.`
    // (parsed?.usage) only evaluates once `parsed?.type === RESULT_TYPE` held, i.e. parsed
    // is already a truthy object, so dropping it changes nothing (equivalent mutant).
    if (parsed?.type === RESULT_TYPE && parsed?.usage) {
      events.push(eventFromResult(parsed));
    }
  }
  return { events, skipped, markers: [] };
}
