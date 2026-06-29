/**
 * Claude pricing binding — pure, immutable, no I/O module.
 *
 * Exports the verified Claude model price table and pure merge helpers.
 * The core (usage-aggregate.js) consumes an injected priceTable and
 * multiplies raw token counts by these per-MTok dollar rates.
 *
 * Unit: USD per million tokens (per-MTok).
 * The core stores per-MTok rates directly; no 1e6 scaling is applied.
 *
 * @update-needed Prices are spot-checked against the `claude-api` skill.
 * Run `/claude-api` to fetch current list prices and update this table.
 */

/**
 * Date when these prices were last verified against the Claude API skill.
 *
 * @update-needed Check current prices via the `claude-api` skill.
 * @type {string}
 */
export const PRICES_AS_OF = Object.freeze('2026-06-28');

/**
 * Cache tier multipliers applied to the base input rate.
 *
 * Standard Anthropic cache pricing:
 * - cacheRead:        0.1  × input
 * - cacheCreation5m:  1.25 × input
 * - cacheCreation1h:  2.0  × input
 */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_CREATION_5M_MULTIPLIER = 1.25;
const CACHE_CREATION_1H_MULTIPLIER = 2.0;

/**
 * Compute a frozen per-MTok price entry from base input/output rates.
 *
 * @param {number} input  - Input token rate ($/MTok)
 * @param {number} output - Output token rate ($/MTok)
 * @returns {{ input: number, cacheRead: number, cacheCreation5m: number, cacheCreation1h: number, output: number }}
 */
const priceEntry = (input, output) =>
  Object.freeze({
    input,
    cacheRead: input * CACHE_READ_MULTIPLIER,
    cacheCreation5m: input * CACHE_CREATION_5M_MULTIPLIER,
    cacheCreation1h: input * CACHE_CREATION_1H_MULTIPLIER,
    output,
  });

/**
 * Default Claude model price table (per-MTok USD rates).
 * Keys are normalized model ids (no `[1m]` suffix — normalization lives in
 * telemetry-claude.js, Part 3).
 *
 * @update-needed Verify against the `claude-api` skill when models change.
 * @type {Readonly<Record<string, { input: number, cacheRead: number, cacheCreation5m: number, cacheCreation1h: number, output: number }>>}
 */
export const DEFAULT_PRICES = Object.freeze({
  'claude-opus-4-8': priceEntry(5, 25),
  'claude-opus-4-7': priceEntry(5, 25),
  'claude-opus-4-6': priceEntry(5, 25),
  'claude-sonnet-4-6': priceEntry(3, 15),
  'claude-fable-5': priceEntry(10, 50),
  'claude-mythos-5': priceEntry(10, 50),
  'claude-haiku-4-5': priceEntry(1, 5),
});

/**
 * Merge a price override on top of the defaults.
 * Returns a freshly constructed table; inputs are never mutated.
 * Each entry in the result is frozen.
 *
 * @param {Record<string, object>} defaults  - Base price table (e.g. DEFAULT_PRICES)
 * @param {Record<string, object> | null | undefined} override - Caller-supplied overrides
 * @returns {Record<string, object>} New merged table
 */
export const mergePrices = (defaults, override) => {
  const merged = {};
  for (const [id, entry] of Object.entries(defaults)) {
    merged[id] = Object.freeze({ ...entry });
  }
  if (override != null) {
    for (const [id, entry] of Object.entries(override)) {
      // B1: field-level merge — partial override keeps other rates from defaults.
      merged[id] = Object.freeze({ ...(defaults[id] ?? {}), ...entry });
    }
  }
  return merged;
};

/**
 * Load the effective price table by merging DEFAULT_PRICES with an optional
 * caller-supplied override (parsed from --prices <file> JSON by Part 4).
 *
 * @param {Record<string, object> | null | undefined} overrideJsonOrNull
 * @returns {Record<string, object>} Merged price table
 */
export const loadPriceTable = (overrideJsonOrNull) =>
  mergePrices(DEFAULT_PRICES, overrideJsonOrNull);
