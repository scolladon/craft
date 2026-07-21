/**
 * manifest-vocabulary — general frozen Sets shared across manifest validators.
 * Pure data; no I/O, no validation logic.
 */

/** Known top-level keys, including pipeline, retrieval, and execution for phase orchestration. */
export const TOP_KEYS = Object.freeze(new Set([
  'backlog', 'memory', 'paths', 'context', 'gates', 'phases',
  'pr', 'scripts', 'models', 'pipeline', 'retrieval', 'execution',
  'extends', 'policy', 'intention', 'hygiene',
]));

/**
 * Canonical concern ids accepted as children of the `phases` key.
 * Old names (branch, docs, …) resolve to these via resolveAlias.
 */
export const PHASE_NAMES = Object.freeze(new Set([
  'workspace', 'requirements', 'design', 'decisions', 'planning',
  'implementation', 'review', 'refactoring', 'validation',
  'architecture', 'documentation', 'propose', 'integrate',
]));

/** Fields accepted on each phase block (skip is intentionally absent — use top-level pipeline.skip instead). */
export const PHASE_FIELDS = Object.freeze(new Set([
  'context', 'override', 'strategy', 'merge-flags', 'non-blocking-jobs',
  'harness', 'execution', 'enabled', 'role', 'model', 'procedure', 'required',
]));

/** Fields accepted under the `gates` key. */
export const GATE_FIELDS = Object.freeze(new Set(['part', 'phase', 'review-batch']));

/** Fields accepted under the `pr` key. */
export const PR_FIELDS = Object.freeze(new Set(['creator', 'pre-pr-gate']));

/** Fields accepted under the `scripts` key. */
export const SCRIPT_FIELDS = Object.freeze(new Set(['post-setup', 'pre-teardown']));

/** Agent/role names accepted under the `models` key. */
export const MODELS_KEYS = Object.freeze(new Set([
  'fallback', 'designer', 'planner', 'reviewer',
  'part-implementer', 'refactor-executor', 'harness-triager',
  'docs-writer', 'backlog-ticker',
]));

/** Old agent name that has been renamed to `harness-triager`. */
export const DEPRECATED_AGENT_NAMES = Object.freeze(new Set([
  'validation-triager',
]));

/** Sub-keys accepted under the `pipeline` key. */
export const PIPELINE_KEYS = Object.freeze(new Set(['profile', 'skip', 'insert', 'reorder']));

/** Valid source identifiers for the `backlog` key. */
export const BACKLOG_SOURCES = Object.freeze(new Set(['file', 'custom']));

/** Valid source identifiers for the `memory` key. */
export const MEMORY_SOURCES = Object.freeze(new Set(['file', 'custom']));

/** Valid source identifiers for the `intention` key. */
export const INTENTION_SOURCES = Object.freeze(new Set(['file', 'custom']));

/** Valid gate values for the `intention` key. */
export const INTENTION_GATES = Object.freeze(new Set(['advisory', 'blocking']));

/** Valid gate values for the `hygiene` key. */
export const HYGIENE_GATES = Object.freeze(new Set(['advisory', 'blocking']));
