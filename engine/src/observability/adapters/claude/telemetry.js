/**
 * Claude JSONL binding: transcript lines → UsageEvent[].
 *
 * Converts raw Claude Code session transcripts (JSONL) into vendor-neutral
 * UsageEvent objects consumed by the usage-aggregate core.
 *
 * Claude Code writes one transcript line per content block of a single
 * assistant API response (thinking, text, each tool_use) — every one of those
 * lines repeats the same `message.id` and the same request-level input/cache
 * counts. Emission is therefore keyed on `message.id`, not the line: the first
 * usage-bearing line for an id pushes an event; a later line for the same id
 * replaces that event's tokens/cacheCreationTtl in place instead of pushing a
 * duplicate (output is monotonic across a turn's blocks, so the last line
 * carries the complete turn). A line with no `message.id` always pushes — there
 * is nothing to key a dedup against. This message-keying is what makes
 * one-event-per-billed-turn hold.
 *
 * A spawn rollup rides on a `user` line's `toolUseResult` and never carries
 * `message.usage`, so rollups are read for neither tokens nor labels — the two
 * shapes are disjoint by construction, which keeps the rollup tier unreachable
 * from here. That disjointness alone does not guarantee uniqueness *within*
 * the assistant tier — the message-id keying above is what enforces that.
 *
 * The optional third `context` argument is authored by the claude adapter's
 * `discover()` (main-loop vs. sub-agent transcript) and is opaque here beyond
 * the fields this module reads from it.
 *
 * No clock reads, no random, no model-id literals in core paths.
 */

import { autoSkipPhasesInText } from '../../skip-signals.js';

const MODEL_1M_SUFFIX = '[1m]';
const CRAFT_PREFIX = 'craft:';
// Zero-cost injected turns (e.g. spawn bookkeeping) carry a usage block but are
// not billed and are not attributable to a role — excluded at the emission
// site rather than filtered downstream.
const SYNTHETIC_MODEL = '<synthetic>';
// C6: exported so metrics-split.js can single-source these field names.
export const CACHE_READ_FIELD = 'cache_read_input_tokens';
export const CACHE_CREATION_FIELD = 'cache_creation_input_tokens';

// F6: coerce non-finite values (string, NaN, null) to 0 so they can't poison cost math.
const numOrZero = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Map from the role label (agentType after stripping the "craft:" prefix)
 * to the vendor-neutral phase label.
 */
const ROLE_TO_PHASE = Object.freeze({
  'designer': 'design',
  'planner': 'planning',
  'part-implementer': 'implementation',
  'reviewer': 'review',
  'harness-triager': 'validation',
  'validation-triager': 'validation',
  'docs-writer': 'documentation',
  'backlog-ticker': 'documentation',
  'requirements-writer': 'requirements',
  'refactor-executor': 'refactoring',
});

/**
 * Strip the [1m] context-size suffix from a model id if present.
 *
 * @param {string | null} model
 * @returns {string | null}
 */
function normalizeModel(model) {
  if (typeof model !== 'string') return model;
  return model.endsWith(MODEL_1M_SUFFIX)
    ? model.slice(0, -MODEL_1M_SUFFIX.length)
    : model;
}

/**
 * Derive the vendor-neutral role string from a raw agentType.
 * Strips the "craft:" prefix; returns the agentType as-is for non-craft types.
 *
 * @param {string | null | undefined} agentType
 * @returns {string | null}
 */
function roleFromAgentType(agentType) {
  if (!agentType) return null;
  return agentType.startsWith(CRAFT_PREFIX)
    ? agentType.slice(CRAFT_PREFIX.length)
    : agentType;
}

/**
 * Derive the vendor-neutral phase label from a raw agentType.
 * Returns null for unrecognized types.
 *
 * @param {string | null | undefined} agentType
 * @returns {string | null}
 */
function phaseFromAgentType(agentType) {
  const role = roleFromAgentType(agentType);
  // role is derived from an untrusted sidecar/transcript field — a bare
  // ROLE_TO_PHASE[role] would resolve an inherited Object.prototype member
  // (e.g. role: "constructor" → the Object function) as a truthy-but-wrong
  // phase. Object.hasOwn gates the lookup to the table's own keys only.
  return role && Object.hasOwn(ROLE_TO_PHASE, role) ? ROLE_TO_PHASE[role] : null;
}

/**
 * Map a raw Claude `usage` object (from message.usage) to the vendor-neutral
 * token shape the core consumes.
 *
 * Accepts the standard Claude API field names (input_tokens, etc.).
 * The cacheCreationTtl is extracted when cache_creation is a plain object
 * carrying the 5m/1h TTL split; null when absent.
 *
 * @param {object} usage - Raw Claude usage object
 * @returns {{ tokens: { input: number, cacheRead: number, cacheCreation: number, output: number }, cacheCreationTtl: { creation5m: number, creation1h: number } | null }}
 */
export function tokensFromClaudeUsage(usage) {
  const tokens = {
    input: numOrZero(usage.input_tokens),
    cacheRead: numOrZero(usage[CACHE_READ_FIELD]),
    cacheCreation: numOrZero(usage[CACHE_CREATION_FIELD]),
    output: numOrZero(usage.output_tokens),
  };
  const cc = usage.cache_creation;
  const cacheCreationTtl = (cc != null && typeof cc === 'object')
    ? {
        creation5m: cc.ephemeral_5m_input_tokens ?? 0,
        creation1h: cc.ephemeral_1h_input_tokens ?? 0,
      }
    : null;
  return { tokens, cacheCreationTtl };
}

/**
 * Concatenate the text of a parsed assistant line's message content. Tolerates a
 * string content, an array of `{ text }` blocks, or neither (returns '').
 * @param {object} parsed
 * @returns {string}
 */
function assistantTextOf(parsed) {
  const content = parsed?.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(block => (typeof block?.text === 'string' ? block.text : '')).join('\n');
}

/**
 * Fold a Date.parse result into the running [min, max] timestamp span. A
 * non-finite parse (missing/malformed timestamp) leaves the span untouched —
 * it contributes neither a floor nor a ceiling, never a clock read.
 *
 * @param {{ first: number | null, last: number | null }} span
 * @param {string | null} timestamp
 * @returns {{ first: number | null, last: number | null }}
 */
function foldTimestamp(span, timestamp) {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return span;
  return {
    first: span.first === null ? parsed : Math.min(span.first, parsed),
    last: span.last === null ? parsed : Math.max(span.last, parsed),
  };
}

/**
 * Fold one usage-bearing line into `events`, keyed on the assistant
 * `message.id`. The first line for an id pushes `candidateEvent`; a later
 * line for the same id replaces the existing event's tokens/cacheCreationTtl
 * in place rather than pushing a duplicate — see the module header for why.
 * A null `messageId` always pushes, since there is nothing to key against.
 *
 * @param {object[]} events - mutated in place
 * @param {Map<string, number>} indexByMessageId - message id → index into events
 * @param {string | null} messageId
 * @param {object} candidateEvent - pushed when this id is new
 * @param {{ tokens: object, cacheCreationTtl: object | null }} replacement - applied when this id already exists
 */
function foldEventByMessageId(events, indexByMessageId, messageId, candidateEvent, replacement) {
  const existingIndex = messageId === null ? undefined : indexByMessageId.get(messageId);
  if (existingIndex !== undefined) {
    events[existingIndex].tokens = replacement.tokens;
    events[existingIndex].cacheCreationTtl = replacement.cacheCreationTtl;
    return;
  }
  events.push(candidateEvent);
  if (messageId !== null) indexByMessageId.set(messageId, events.length - 1);
}

/**
 * Parse an async iterable of raw JSONL lines into UsageEvents.
 *
 * Emission rule: one UsageEvent per distinct assistant `message.id` (or per
 * line, for a line carrying no id) — see the module header for why a later
 * line sharing an id replaces rather than duplicates.
 * Malformed lines (not valid JSON) are skipped and counted in `skipped`.
 *
 * The `since` cutoff is an ISO timestamp string. When set, lines whose
 * top-level `timestamp` predates the cutoff are dropped before anything else
 * — token totals and the sub-agent duration span are both derived only from
 * surviving lines (timestamp is used for internal ordering only — never
 * emitted, redaction-safe).
 *
 * `context.sourceKind === 'subagent'` switches labelling from the literal
 * `role: 'main-loop'` to `roleFromAgentType(context.agentType)`, gates the
 * `auto-skip:` run-record scan off (those tokens are orchestrator prose, and a
 * sub-agent transcript is untrusted output, not a run record), and folds the
 * transcript's timestamp span onto the last emitted event's `durationMs`
 * instead of leaving it at 0. It also stamps `context.spawnId` — the opaque
 * per-transcript ordinal the front door assigns once per parseLines() call —
 * onto every emitted event as `spawnId`, giving the aggregate core a spawn
 * identity to count review cycles by (one sub-agent transcript IS one spawn,
 * however many billed turns it contains). Main-loop events always carry
 * `spawnId: null`: a main-loop transcript is not itself a spawn, and its
 * events never reach `phase: 'review'` in the first place (phase is always
 * null on the main-loop path below).
 *
 * @param {AsyncIterable<string>} lines - Line stream
 * @param {string | null} [since] - ISO timestamp cutoff (inclusive lower bound)
 * @param {{ sourceKind?: string, agentType?: string | null, includeInline?: boolean, spawnId?: number } | null} [context]
 * @returns {Promise<{ events: object[], skipped: number, markers: object[], unlabelled: number }>}
 */
export async function parseLines(lines, since = null, context = null) {
  const isSubagent = context?.sourceKind === 'subagent';
  const events = [];
  const indexByMessageId = new Map();
  const markers = [];
  let skipped = 0;
  let sawUnlabelledEvent = false;
  let span = { first: null, last: null };

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
    // --since filter — timestamp is internal only, never emitted.
    if (since) {
      const ts = parsed.timestamp ?? null;
      if (ts !== null && ts < since) continue;
    }

    // Run-record `auto-skip:` tokens ride in orchestrator assistant text. A
    // sub-agent's own output is untrusted content, not a run record — scanning
    // it would let a sub-agent inject a false phase-skip marker.
    if (!isSubagent) {
      const run = parsed.sessionId ?? null;
      for (const phase of autoSkipPhasesInText(assistantTextOf(parsed))) {
        markers.push({ run, phase });
      }
    }

    const usage = parsed.message?.usage;
    if (usage == null) continue;
    // Zero-cost injected turns (spawn bookkeeping) are not billed and are not
    // attributable to a role — see the SYNTHETIC_MODEL definition above.
    if (parsed.message?.model === SYNTHETIC_MODEL) continue;
    // Main-loop inclusion is default-on; --no-inline (front door) sets
    // includeInline: false to opt back out. Sub-agent streams always emit —
    // there is no separate "inline gap" concept once the read is opened at all.
    if (!isSubagent && context?.includeInline === false) continue;

    const { tokens, cacheCreationTtl } = tokensFromClaudeUsage(usage);
    // The transcript span belongs to every surviving line, whether or not that
    // line ends up folded into an earlier event by the message-id keying below.
    if (isSubagent) span = foldTimestamp(span, parsed.timestamp ?? null);

    const messageId = parsed.message?.id ?? null;
    const role = isSubagent ? roleFromAgentType(context.agentType) : 'main-loop';
    if (role === null) sawUnlabelledEvent = true;
    const phase = isSubagent ? phaseFromAgentType(context.agentType) : null;
    // See the module header: a spawn identity belongs only to a sub-agent
    // transcript, never to the main loop.
    const spawnId = isSubagent ? (context.spawnId ?? null) : null;

    foldEventByMessageId(events, indexByMessageId, messageId, {
      run: parsed.sessionId ?? null,
      slug: parsed.slug ?? null,
      phase,
      role,
      spawnId,
      model: normalizeModel(parsed.message?.model ?? null),
      tokens,
      cacheCreationTtl,
      messages: 1,
      // Main-loop durationMs stays 0 on every event, including the last — see
      // below. Sub-agent events default to 0 too; the last one is patched with
      // the transcript's span once the stream ends.
      durationMs: 0,
    }, { tokens, cacheCreationTtl });
  }

  // The orchestrator's own wallclock span overlaps every sub-agent span spawned
  // within it, so attributing main-loop duration would roughly double a report
  // figure whose prose is scoped to role-agent activity alone. Sub-agent
  // duration has no such overlap — it is the one span that is genuinely theirs
  // — so it is folded onto the last event once the transcript is fully read.
  // Main-loop `messages` is not zeroed: a billed-turn count is real and nothing
  // else reconstructs it.
  if (isSubagent && events.length > 0 && span.first !== null && span.last !== null) {
    events[events.length - 1].durationMs = span.last - span.first;
  }

  return { events, skipped, markers, unlabelled: sawUnlabelledEvent ? 1 : 0 };
}
