// C6: field names single-sourced from telemetry-claude.js — no local duplicates.
import { tokensFromClaudeUsage, CACHE_READ_FIELD, CACHE_CREATION_FIELD } from './telemetry.js';

function hasCacheFields(usage) {
  return CACHE_READ_FIELD in usage || CACHE_CREATION_FIELD in usage;
}

/**
 * Format the cache read/creation split from a raw Claude usage block.
 * Degrades to `cache=na` only when the split is genuinely absent
 * (no usage object, or neither cache field present).
 *
 * @param {object|null|undefined} usage - Raw Claude usage block
 * @returns {string} `cache_read=<n> cache_creation=<n>` or `cache=na`
 */
export function formatCacheSplit(usage) {
  if (usage == null || typeof usage !== 'object' || !hasCacheFields(usage)) {
    return 'cache=na';
  }
  const { tokens } = tokensFromClaudeUsage(usage);
  return `cache_read=${tokens.cacheRead} cache_creation=${tokens.cacheCreation}`;
}
