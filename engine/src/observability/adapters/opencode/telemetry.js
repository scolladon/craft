/**
 * opencode JSON-lines binding: `opencode run --format json` events → UsageEvent[].
 *
 * Converts raw opencode run events into the same vendor-neutral UsageEvent shape
 * consumed by the usage-aggregate core (reused unchanged). The exact upstream
 * event schema is not finalized — this binding maps against a frozen, synthetic
 * event shape (see engine/test/fixtures/opencode/), to be re-pinned once a real
 * opencode event stream is observed.
 *
 * No clock reads, no random, no model-id literals in core paths.
 */

import { phaseForRole } from '../../role-phase.js';

const SYNTHETIC_MODEL = '<synthetic>';
const CRAFT_PREFIX = 'craft-';

// Coerce non-finite values (string, NaN, null, undefined) to 0 so they can't
// poison downstream cost math.
const numOrZero = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Derive the vendor-neutral role string from a raw opencode agent name.
 * Strips the "craft-" prefix; returns the agent name as-is for non-craft agents.
 *
 * @param {string | null | undefined} agent
 * @returns {string | null}
 */
function roleFromAgent(agent) {
  if (!agent) return null;
  return agent.startsWith(CRAFT_PREFIX) ? agent.slice(CRAFT_PREFIX.length) : agent;
}

/**
 * Derive the vendor-neutral phase label from a raw opencode agent name.
 * Returns null for unrecognized roles.
 *
 * @param {string | null | undefined} agent
 * @returns {string | null}
 */
function phaseFromAgent(agent) {
  return phaseForRole(roleFromAgent(agent));
}

/**
 * Map a raw opencode `tokens` object to the vendor-neutral token shape the
 * core consumes. Field names already match; values are coerced through
 * numOrZero so malformed/non-numeric fields can't poison cost math.
 *
 * @param {object} tokens - Raw opencode tokens object
 * @returns {{ input: number, cacheRead: number, cacheCreation: number, output: number }}
 */
export function tokensFromOpencodeUsage(tokens) {
  return {
    input: numOrZero(tokens?.input),
    cacheRead: numOrZero(tokens?.cacheRead),
    cacheCreation: numOrZero(tokens?.cacheCreation),
    output: numOrZero(tokens?.output),
  };
}

/**
 * Map a raw opencode `cacheCreationTtl` object to the neutral TTL split, or
 * null when the parsed line carries no such field.
 *
 * @param {object | null | undefined} cc
 * @returns {{ creation5m: number, creation1h: number } | null}
 */
function cacheCreationTtlFrom(cc) {
  if (cc == null || typeof cc !== 'object') return null;
  return { creation5m: numOrZero(cc.creation5m), creation1h: numOrZero(cc.creation1h) };
}

/**
 * Convert one parsed opencode run event into a UsageEvent.
 * Returns null for synthetic-model events (zero-cost injected spawns).
 *
 * @param {object} parsed - one parsed JSON line from `opencode run --format json`
 * @returns {object | null} UsageEvent or null
 */
export function eventFromOpencodeLine(parsed) {
  const model = parsed.model ?? null;
  if (model === SYNTHETIC_MODEL) return null;

  const agent = parsed.agent ?? null;

  return {
    run: parsed.sessionID ?? null,
    slug: parsed.slug ?? null,
    phase: phaseFromAgent(agent),
    role: roleFromAgent(agent),
    model,
    tokens: tokensFromOpencodeUsage(parsed.tokens ?? {}),
    cacheCreationTtl: cacheCreationTtlFrom(parsed.cacheCreationTtl),
    messages: numOrZero(parsed.toolCalls),
    durationMs: numOrZero(parsed.durationMs),
  };
}

/**
 * Parse an async iterable of raw JSONL lines (from `opencode run --format
 * json`) into UsageEvents.
 *
 * Malformed lines (not valid JSON) are skipped and counted in `skipped`.
 * Synthetic-model events are excluded (zero-cost, not attributable).
 *
 * The `since` cutoff is an ISO timestamp string. When set, lines whose
 * top-level `time` field predates the cutoff are silently dropped (used for
 * internal filtering only — never emitted, redaction-safe).
 *
 * opencode's auto-skip token mapping is deferred — `markers` is always `[]`.
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
    if (since) {
      const ts = parsed.time ?? null;
      if (ts !== null && ts < since) continue;
    }
    const event = eventFromOpencodeLine(parsed);
    if (event !== null) events.push(event);
  }
  return { events, skipped, markers: [] };
}
