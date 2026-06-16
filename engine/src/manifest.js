/**
 * validateManifest — pure manifest shape validator.
 * Accepts a pre-parsed JS object (js-yaml output) and an opts bag.
 * Never throws; accumulates errors and returns { ok, errors[] }.
 * No I/O — file-existence checks are injected via opts.fileExists.
 */

/** Known top-level keys (ADR-010 adds pipeline, retrieval, execution). */
const TOP_KEYS = Object.freeze(new Set([
  'backlog', 'paths', 'context', 'gates', 'phases',
  'pr', 'scripts', 'models', 'pipeline', 'retrieval', 'execution',
]));

/** Phase names accepted as children of the `phases` key (OLD set — alias wiring is P4). */
const PHASE_NAMES = Object.freeze(new Set([
  'branch', 'design', 'adr', 'plan', 'implement',
  'review', 'refactor', 'mutation', 'docs', 'pr', 'merge',
]));

/** Fields accepted on each phase block (skip is intentionally absent — ADR-011). */
const PHASE_FIELDS = Object.freeze(new Set([
  'context', 'override', 'strategy', 'merge-flags', 'non-blocking-jobs',
]));

/** Fields accepted under the `gates` key. */
const GATE_FIELDS = Object.freeze(new Set(['slice', 'phase', 'review-batch']));

/** Fields accepted under the `pr` key. */
const PR_FIELDS = Object.freeze(new Set(['creator', 'pre-pr-gate']));

/** Fields accepted under the `scripts` key. */
const SCRIPT_FIELDS = Object.freeze(new Set(['post-setup', 'pre-teardown']));

/** Agent/role names accepted under the `models` key. */
const MODELS_KEYS = Object.freeze(new Set([
  'fallback', 'designer', 'planner', 'reviewer',
  'slice-implementer', 'refactor-executor', 'mutation-triager',
  'docs-writer', 'backlog-ticker',
]));

/** Sub-keys accepted under the `pipeline` key. */
const PIPELINE_KEYS = Object.freeze(new Set(['profile', 'skip', 'insert']));

/**
 * Sentinel values that indicate an absent path (no file-existence check needed).
 * @param {unknown} value
 * @returns {boolean}
 */
function isAbsentPath(value) {
  return value === null || value === undefined || value === '' || value === '~';
}

/**
 * Coerce a scalar-or-array value into a flat array of strings.
 * @param {unknown} value
 * @returns {string[]}
 */
function toStringArray(value) {
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

/**
 * Check a single file-ref value, accumulating an error on miss.
 * Handles scalar string or array of strings; skips absent sentinels.
 *
 * @param {string} label   - human-readable path label for the error message
 * @param {unknown} value  - the manifest value (string, string[], null, etc.)
 * @param {(path: string) => boolean} fileExists - injected predicate
 * @param {string[]} errors - accumulator
 */
function checkFileRef(label, value, fileExists, errors) {
  if (isAbsentPath(value)) return;
  for (const path of toStringArray(value)) {
    if (isAbsentPath(path)) continue;
    if (!fileExists(path)) {
      errors.push(`${label} references missing file: ${path}`);
    }
  }
}

/**
 * Validate the `models` sub-object.
 * @param {Record<string, unknown>} models
 * @param {string[]} errors
 */
function validateModels(models, errors) {
  if (!models || typeof models !== 'object' || Array.isArray(models)) return;
  for (const key of Object.keys(models)) {
    if (!MODELS_KEYS.has(key)) {
      errors.push(`unknown models key: ${key} (expected an agent name or 'fallback')`);
    }
  }
}

/**
 * Validate the `gates` sub-object.
 * @param {Record<string, unknown>} gates
 * @param {string[]} errors
 */
function validateGates(gates, errors) {
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) return;
  for (const key of Object.keys(gates)) {
    if (!GATE_FIELDS.has(key)) {
      errors.push(`unknown gates field: ${key}`);
    }
  }
}

/**
 * Validate the `pr` sub-object.
 * @param {Record<string, unknown>} pr
 * @param {string[]} errors
 */
function validatePr(pr, errors) {
  if (!pr || typeof pr !== 'object' || Array.isArray(pr)) return;
  for (const key of Object.keys(pr)) {
    if (!PR_FIELDS.has(key)) {
      errors.push(`unknown pr field: ${key}`);
    }
  }
}

/**
 * Validate the `scripts` sub-object.
 * @param {Record<string, unknown>} scripts
 * @param {(path: string) => boolean} fileExists
 * @param {string[]} errors
 */
function validateScripts(scripts, fileExists, errors) {
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return;
  for (const [key, value] of Object.entries(scripts)) {
    if (!SCRIPT_FIELDS.has(key)) {
      errors.push(`unknown scripts field: ${key}`);
    }
    checkFileRef(`scripts.${key}`, value, fileExists, errors);
  }
}

/**
 * Validate the `pipeline` sub-object (ADR-010).
 * @param {Record<string, unknown>} pipeline
 * @param {string[]} errors
 */
function validatePipeline(pipeline, errors) {
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) return;
  for (const key of Object.keys(pipeline)) {
    if (!PIPELINE_KEYS.has(key)) {
      errors.push(`unknown pipeline key: ${key}`);
    }
  }
}

/**
 * Validate a single phase block.
 * @param {string} phaseName
 * @param {Record<string, unknown>} block
 * @param {(path: string) => boolean} fileExists
 * @param {string[]} errors
 */
function validatePhaseBlock(phaseName, block, fileExists, errors) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return;
  for (const [field, value] of Object.entries(block)) {
    if (field === 'skip') {
      // ADR-011: per-phase skip is inert — redirect to top-level pipeline.skip
      errors.push(
        `per-phase skip: is inert — use top-level pipeline.skip: [${phaseName}]`,
      );
      continue;
    }
    if (!PHASE_FIELDS.has(field)) {
      errors.push(`unknown field on phase ${phaseName}: ${field}`);
      continue;
    }
    if (field === 'context') {
      checkFileRef(`phases.${phaseName}.context`, value, fileExists, errors);
    } else if (field === 'override') {
      checkFileRef(`phases.${phaseName}.override`, value, fileExists, errors);
    }
  }
}

/**
 * Validate the `phases` sub-object.
 * @param {Record<string, unknown>} phases
 * @param {(path: string) => boolean} fileExists
 * @param {string[]} errors
 */
function validatePhases(phases, fileExists, errors) {
  if (!phases || typeof phases !== 'object' || Array.isArray(phases)) return;
  for (const [phaseName, block] of Object.entries(phases)) {
    if (!PHASE_NAMES.has(phaseName)) {
      errors.push(`unknown phase: ${phaseName}`);
    }
    validatePhaseBlock(phaseName, block, fileExists, errors);
  }
}

/**
 * Validate a pre-parsed manifest object.
 * Returns { ok: boolean, errors: string[] }; never throws.
 *
 * @param {Record<string, unknown>|null|undefined} manifest - js-yaml load() output
 * @param {{ fileExists: (path: string) => boolean }} opts
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateManifest(manifest, opts) {
  if (manifest === null || manifest === undefined) return { ok: true, errors: [] };

  const { fileExists } = opts;
  const errors = [];

  for (const [key, value] of Object.entries(manifest)) {
    if (!TOP_KEYS.has(key)) {
      errors.push(`unknown top-level key: ${key}`);
      continue;
    }

    switch (key) {
      case 'models':
        validateModels(value, errors);
        break;
      case 'context':
        checkFileRef('context', value, fileExists, errors);
        break;
      case 'gates':
        validateGates(value, errors);
        break;
      case 'pr':
        validatePr(value, errors);
        break;
      case 'scripts':
        validateScripts(value, fileExists, errors);
        break;
      case 'pipeline':
        validatePipeline(value, errors);
        break;
      case 'phases':
        validatePhases(value, fileExists, errors);
        break;
      // backlog, paths, retrieval, execution: recognized; no sub-validation
    }
  }

  return { ok: errors.length === 0, errors };
}
