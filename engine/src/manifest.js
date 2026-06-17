/**
 * validateManifest — pure manifest shape validator.
 * Accepts a pre-parsed JS object (js-yaml output) and an opts bag.
 * Never throws; accumulates errors and returns { ok, errors[] }.
 * No I/O — file-existence checks are injected via opts.fileExists.
 */

import { resolveAlias } from './alias-map.js';

/** Known top-level keys (ADR-010 adds pipeline, retrieval, execution). */
const TOP_KEYS = Object.freeze(new Set([
  'backlog', 'paths', 'context', 'gates', 'phases',
  'pr', 'scripts', 'models', 'pipeline', 'retrieval', 'execution',
]));

/**
 * Canonical concern ids accepted as children of the `phases` key.
 * Old names (branch, mutation, docs, …) resolve to these via resolveAlias.
 */
const PHASE_NAMES = Object.freeze(new Set([
  'workspace', 'requirements', 'design', 'decisions', 'planning',
  'implementation', 'review', 'refactoring', 'validation',
  'architecture', 'documentation', 'propose', 'integrate',
]));

/** Fields accepted on each phase block (skip is intentionally absent — ADR-011). */
const PHASE_FIELDS = Object.freeze(new Set([
  'context', 'override', 'strategy', 'merge-flags', 'non-blocking-jobs',
  'harness', 'execution', 'enabled', 'role', 'model',
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
  'slice-implementer', 'refactor-executor', 'validation-triager',
  'docs-writer', 'backlog-ticker',
]));

/** Sub-keys accepted under the `pipeline` key. */
const PIPELINE_KEYS = Object.freeze(new Set(['profile', 'skip', 'insert', 'reorder']));

/** Accepted string values for a harness `convergence` knob (ADR-030). */
const CONVERGENCE_STRINGS = Object.freeze(new Set(['low-only', 'none']));

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
    if (MODELS_KEYS.has(key)) continue;
    if (key === 'mutation-triager') {
      errors.push(`models key 'mutation-triager' was renamed — use 'validation-triager'`);
      continue;
    }
    errors.push(`unknown models key: ${key} (expected an agent name or 'fallback')`);
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
 * Validate the `pipeline.reorder` value.
 * @param {unknown} reorder
 * @param {string[]} errors
 */
function validateReorder(reorder, errors) {
  if (!Array.isArray(reorder)) {
    errors.push('pipeline.reorder must be a list of phase ids');
    return;
  }
  for (const [i, item] of reorder.entries()) {
    if (typeof item !== 'string') {
      errors.push(`pipeline.reorder[${i}]: expected a string id, got ${typeof item}`);
    }
  }
}

/**
 * Validate the shape of a harness block on a phase override (ADR-030).
 * Named sub-keys are type-checked; unknown sub-keys are allowed (forward-compat).
 * Errors accumulate — no short-circuit.
 * @param {unknown} harness
 * @param {string} phaseName
 * @param {string[]} errors
 */
function validateHarness(harness, phaseName, errors) {
  if (!harness || typeof harness !== 'object' || Array.isArray(harness)) {
    errors.push(`phases.${phaseName}.harness must be an object`);
    return;
  }
  if (Object.hasOwn(harness, 'dimensions')) {
    const d = harness.dimensions;
    if (!Array.isArray(d) || d.some(item => typeof item !== 'string')) {
      errors.push(`phases.${phaseName}.harness.dimensions must be a list of strings`);
    }
  }
  if (Object.hasOwn(harness, 'passes')) {
    const p = harness.passes;
    if (!Number.isInteger(p) || p <= 0) {
      errors.push(`phases.${phaseName}.harness.passes must be a positive integer`);
    }
  }
  if (Object.hasOwn(harness, 'max_cycles')) {
    const m = harness.max_cycles;
    if (!Number.isInteger(m) || m <= 0) {
      errors.push(`phases.${phaseName}.harness.max_cycles must be a positive integer`);
    }
  }
  if (Object.hasOwn(harness, 'convergence')) {
    const c = harness.convergence;
    if (!(CONVERGENCE_STRINGS.has(c) || (Number.isFinite(c) && c >= 0))) {
      errors.push(`phases.${phaseName}.harness.convergence must be 'low-only', 'none', or a non-negative number`);
    }
  }
  if (Object.hasOwn(harness, 'tool') && typeof harness.tool !== 'string') {
    errors.push(`phases.${phaseName}.harness.tool must be a string`);
  }
  if (Object.hasOwn(harness, 'scope') && typeof harness.scope !== 'string') {
    errors.push(`phases.${phaseName}.harness.scope must be a string`);
  }
  if (Object.hasOwn(harness, 'incremental') && typeof harness.incremental !== 'boolean') {
    errors.push(`phases.${phaseName}.harness.incremental must be a boolean`);
  }
}

/**
 * Validate the `pipeline` sub-object keys (ADR-010).
 * Named distinctly from the graph's exported `validatePipeline(descriptors)`:
 * this checks manifest-shape sub-keys, not the descriptor DAG.
 * @param {Record<string, unknown>} pipeline
 * @param {string[]} errors
 */
function validatePipelineKeys(pipeline, errors) {
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) return;
  for (const key of Object.keys(pipeline)) {
    if (!PIPELINE_KEYS.has(key)) {
      errors.push(`unknown pipeline key: ${key}`);
    }
  }
  if (Object.hasOwn(pipeline, 'reorder')) {
    validateReorder(pipeline.reorder, errors);
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
    // execution: accepted by PHASE_FIELDS; value checked by validateExecutionValues in resolve.js — no check here
    if (field === 'context') {
      checkFileRef(`phases.${phaseName}.context`, value, fileExists, errors);
    } else if (field === 'override') {
      checkFileRef(`phases.${phaseName}.override`, value, fileExists, errors);
    } else if (field === 'role' && typeof value !== 'string') {
      errors.push(`phases.${phaseName}.role must be a string`);
    } else if (field === 'model' && typeof value !== 'string') {
      errors.push(`phases.${phaseName}.model must be a string`);
    } else if (field === 'enabled' && typeof value !== 'boolean') {
      errors.push(`phases.${phaseName}.enabled must be a boolean`);
    } else if (field === 'harness') {
      validateHarness(value, phaseName, errors);
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
    if (!PHASE_NAMES.has(resolveAlias(phaseName))) {
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
 * @param {{ fileExists?: (path: string) => boolean }} [opts] - fileExists defaults to
 *   "assume present" when omitted (file existence is a separate, injected concern); the
 *   guard keeps the never-throws contract even if a caller forgets opts.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateManifest(manifest, opts) {
  if (manifest === null || manifest === undefined) return { ok: true, errors: [] };

  const fileExists = typeof opts?.fileExists === 'function' ? opts.fileExists : () => true;
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
        validatePipelineKeys(value, errors);
        break;
      case 'phases':
        validatePhases(value, fileExists, errors);
        break;
      // backlog, paths, retrieval, execution: recognized; no sub-validation
    }
  }

  return { ok: errors.length === 0, errors };
}
