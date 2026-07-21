/**
 * Claude JSONL binding: transcript lines → UsageEvent[].
 *
 * Converts raw Claude Code session transcripts (JSONL) into vendor-neutral
 * UsageEvent objects consumed by the usage-aggregate core. Handles both
 * Agent and Task spawn shapes, and both agentType/subagent_type rollup
 * attribution fields. Inline per-turn usage is a noted gap — not emitted
 * by default; opt-in belongs at the CLI layer via --include-inline.
 *
 * No clock reads, no random, no model-id literals in core paths.
 */

import { autoSkipPhasesInText } from '../../skip-signals.js';

const SYNTHETIC_MODEL = '<synthetic>';
const MODEL_1M_SUFFIX = '[1m]';
const CRAFT_PREFIX = 'craft:';
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
  return role ? (ROLE_TO_PHASE[role] ?? null) : null;
}

/**
 * Map a raw Claude `usage` object (from message.usage or toolUseResult.usage)
 * to the vendor-neutral token shape the core consumes.
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
 * Convert a toolUseResult rollup + line context into a UsageEvent.
 *
 * Accepts both rollup shapes:
 *   - agentType (current harness) or subagent_type (the field name an older harness used)
 * Returns null for synthetic-model rollups (zero-cost injected spawns).
 *
 * @param {object} rollup - toolUseResult object from a JSONL user line
 * @param {{ sessionId: string | null, slug: string | null }} context
 * @returns {object | null} UsageEvent or null
 */
export function eventFromRollup(rollup, context) {
  const resolvedModel = normalizeModel(rollup.resolvedModel ?? rollup.model ?? null);
  if (resolvedModel === SYNTHETIC_MODEL) return null;

  const agentType = rollup.agentType ?? rollup.subagent_type ?? null;
  const { tokens, cacheCreationTtl } = tokensFromClaudeUsage(rollup.usage ?? {});

  return {
    run: context.sessionId ?? null,
    slug: context.slug ?? null,
    phase: phaseFromAgentType(agentType),
    role: roleFromAgentType(agentType),
    model: resolvedModel,
    tokens,
    cacheCreationTtl,
    messages: rollup.totalToolUseCount ?? 0,
    durationMs: rollup.totalDurationMs ?? 0,
  };
}

/**
 * Determine whether a parsed JSONL line carries an agent spawn rollup.
 *
 * @param {object} parsed
 * @returns {boolean}
 */
function isRollupLine(parsed) {
  const tur = parsed.toolUseResult;
  return (
    tur != null &&
    typeof tur === 'object' &&
    (tur.agentType != null || tur.subagent_type != null || tur.resolvedModel != null)
  );
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
 * Parse an async iterable of raw JSONL lines into UsageEvents.
 *
 * Malformed lines (not valid JSON) are skipped and counted in `skipped`.
 * Synthetic-model rollups are excluded (zero-cost, not attributable).
 * Lines without a toolUseResult rollup are silently ignored — inline
 * per-turn usage is not emitted by default (a known upstream gap).
 *
 * The `since` cutoff is an ISO timestamp string. When set, rollup lines whose
 * top-level `timestamp` predates the cutoff are silently dropped (timestamp is
 * used for internal filtering only — never emitted, redaction-safe).
 *
 * @param {AsyncIterable<string>} lines - Line stream
 * @param {string | null} [since] - ISO timestamp cutoff (inclusive lower bound)
 * @returns {Promise<{ events: object[], skipped: number }>}
 */
export async function parseLines(lines, since = null) {
  const events = [];
  const markers = [];
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
    // D: --since filter — timestamp is internal only, never emitted.
    if (since) {
      const ts = parsed.timestamp ?? null;
      if (ts !== null && ts < since) continue;
    }
    // Run-record `auto-skip:` tokens ride in orchestrator assistant text, not a
    // rollup — scanned before the rollup gate. Only run+phase escape (no text).
    const run = parsed.sessionId ?? null;
    for (const phase of autoSkipPhasesInText(assistantTextOf(parsed))) {
      markers.push({ run, phase });
    }
    if (!isRollupLine(parsed)) continue;
    const context = { sessionId: parsed.sessionId ?? null, slug: parsed.slug ?? null };
    const event = eventFromRollup(parsed.toolUseResult, context);
    if (event !== null) events.push(event);
  }
  return { events, skipped, markers };
}
