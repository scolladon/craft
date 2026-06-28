/**
 * validateManifest — pure manifest shape validator.
 * Accepts a pre-parsed JS object (js-yaml output) and an opts bag.
 * Never throws; accumulates errors and returns { ok, errors[] }.
 * No I/O — file-existence checks are injected via opts.fileExists;
 * optional opts.readFile enables structured DoD sidecar validation.
 */

import { resolveAlias } from './alias-map.js';
import { POLICY_ACTIONS, VERDICTS } from './policy.js';
import { checkFileRef } from './manifest-file-ref.js';
import { validateExtends, registeredBacklogNames } from './extends-validation.js';
import { parseDod, validateDodCriteria } from './dod.js';

export { registeredBacklogNames } from './extends-validation.js';

/** Known top-level keys (ADR-010 adds pipeline, retrieval, execution). */
const TOP_KEYS = Object.freeze(new Set([
  'backlog', 'memory', 'paths', 'context', 'gates', 'phases',
  'pr', 'scripts', 'models', 'pipeline', 'retrieval', 'execution',
  'extends', 'policy',
]));

/**
 * Canonical concern ids accepted as children of the `phases` key.
 * Old names (branch, docs, …) resolve to these via resolveAlias.
 */
const PHASE_NAMES = Object.freeze(new Set([
  'workspace', 'requirements', 'design', 'decisions', 'planning',
  'implementation', 'review', 'refactoring', 'validation',
  'architecture', 'documentation', 'propose', 'integrate',
]));

/** Fields accepted on each phase block (skip is intentionally absent — ADR-011). */
const PHASE_FIELDS = Object.freeze(new Set([
  'context', 'override', 'strategy', 'merge-flags', 'non-blocking-jobs',
  'harness', 'execution', 'enabled', 'role', 'model', 'procedure', 'required',
]));

/** Fields accepted under the `gates` key. */
const GATE_FIELDS = Object.freeze(new Set(['part', 'phase', 'review-batch']));

/** Fields accepted under the `pr` key. */
const PR_FIELDS = Object.freeze(new Set(['creator', 'pre-pr-gate']));

/** Fields accepted under the `scripts` key. */
const SCRIPT_FIELDS = Object.freeze(new Set(['post-setup', 'pre-teardown']));

/** Agent/role names accepted under the `models` key. */
const MODELS_KEYS = Object.freeze(new Set([
  'fallback', 'designer', 'planner', 'reviewer',
  'part-implementer', 'refactor-executor', 'harness-triager',
  'docs-writer', 'backlog-ticker',
]));

/** Old agent name that has been renamed to `harness-triager`. */
const DEPRECATED_AGENT_NAMES = Object.freeze(new Set([
  'validation-triager',
]));

/** Sub-keys accepted under the `pipeline` key. */
const PIPELINE_KEYS = Object.freeze(new Set(['profile', 'skip', 'insert', 'reorder']));

/** Accepted string values for a harness `convergence` knob (ADR-030). */
const CONVERGENCE_STRINGS = Object.freeze(new Set(['low-only', 'none']));

/** Valid values for a technique `mode` field. */
const TECHNIQUE_MODES = Object.freeze(new Set(['gate', 'triage']));

/** Valid values for a technique `run-style` field. */
const TECHNIQUE_RUN_STYLES = Object.freeze(new Set(['background', 'sync']));

/** Valid values for a technique `scope` field. */
const TECHNIQUE_SCOPES = Object.freeze(new Set(['per-hunk', 'per-file']));

/** Prototype-chain keys banned from harness phase/knob names to prevent prototype-pollution. */
export const RESERVED_HARNESS_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

/** Valid source identifiers for the `backlog` key. */
const BACKLOG_SOURCES = Object.freeze(new Set(['file', 'custom']));

/** Valid source identifiers for the `memory` key. */
const MEMORY_SOURCES = Object.freeze(new Set(['file', 'custom']));

/**
 * Validate the `models` sub-object.
 * @param {Record<string, unknown>} models
 * @param {string[]} errors
 */
function validateModels(models, errors) {
  if (!models || typeof models !== 'object' || Array.isArray(models)) return;
  for (const key of Object.keys(models)) {
    if (MODELS_KEYS.has(key)) continue;
    if (DEPRECATED_AGENT_NAMES.has(key)) {
      errors.push(`models key '${key}' was renamed — use 'harness-triager'`);
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
 * Validate the `paths` sub-object — checks only the `dod` key as a file-ref;
 * all other sub-keys remain inert.
 * When readFile is provided and paths.dod is set, parses the DoD for a structured
 * sidecar and validates any criteria shape found (back-compat: free-text returns null).
 * @param {Record<string, unknown>} paths
 * @param {(path: string) => boolean} fileExists
 * @param {string[]} errors
 * @param {(path: string) => string | null} [readFile]
 */
function validatePaths(paths, fileExists, errors, readFile) {
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) return;
  checkFileRef('paths.dod', paths.dod, fileExists, errors);
  if (typeof readFile !== 'function' || !paths.dod) return;
  const content = readFile(paths.dod);
  if (content === null || content === undefined) return;
  let parsed;
  try {
    parsed = parseDod(content);
  } catch (e) {
    errors.push(e.message);
    return;
  }
  if (!parsed) return;
  for (const e of validateDodCriteria(parsed.criteria)) errors.push(e);
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

/** Non-built-in tracker values that get a targeted hint instead of the generic error. */
const NON_BUILTIN_TRACKERS = Object.freeze(new Set(['github-issues', 'jira', 'linear']));

/**
 * Validate the `backlog` sub-object.
 * @param {unknown} backlog
 * @param {(path: string) => boolean} fileExists
 * @param {Set<string>} adapterNames  registered backlog-adapter names from extends
 * @param {string[]} errors
 */
function validateBacklog(backlog, fileExists, adapterNames, errors) {
  if (typeof backlog !== 'object' || backlog === null || Array.isArray(backlog)) {
    errors.push('backlog must be an object { source, ref }');
    return;
  }

  for (const k of Object.keys(backlog)) {
    if (k !== 'source' && k !== 'ref') {
      errors.push(`unknown backlog field: ${k}`);
    }
  }

  const { source, ref } = backlog;

  if (source === undefined) {
    errors.push('backlog must declare a source (one of file, custom)');
    return;
  }

  if (!BACKLOG_SOURCES.has(source) && !adapterNames.has(source)) {
    if (NON_BUILTIN_TRACKERS.has(source)) {
      errors.push(`backlog source '${source}' is not built-in — use source: custom with a ref to a resolver script`);
    } else {
      errors.push(`unknown backlog source: ${source} (expected one of file, custom)`);
    }
    return;
  }

  if (source === 'file') {
    checkFileRef('backlog.ref', ref, fileExists, errors);
  } else if (source === 'custom') {
    if (typeof ref !== 'string' || ref.trim() === '') {
      errors.push('backlog.ref is required for source custom');
    }
  }
}

/**
 * Validate the `memory` sub-object.
 * @param {unknown} memory
 * @param {(path: string) => boolean} fileExists
 * @param {string[]} errors
 */
function validateMemory(memory, fileExists, errors) {
  if (typeof memory !== 'object' || memory === null || Array.isArray(memory)) {
    errors.push('memory must be an object { source, ref }');
    return;
  }

  for (const k of Object.keys(memory)) {
    if (k !== 'source' && k !== 'ref') {
      errors.push(`unknown memory field: ${k}`);
    }
  }

  const { source, ref } = memory;

  if (source === undefined) {
    errors.push('memory must declare a source (one of file, custom)');
    return;
  }

  if (!MEMORY_SOURCES.has(source)) {
    errors.push(`unknown memory source: ${source} (expected one of file, custom)`);
    return;
  }

  if (source === 'file') {
    checkFileRef('memory.ref', ref, fileExists, errors);
  } else if (source === 'custom') {
    if (typeof ref !== 'string' || ref.trim() === '') {
      errors.push('memory.ref is required for source custom');
    }
  }
}

/**
 * Record an action into the seen-actions map; push a conflict error if already seen.
 * @param {string} action
 * @param {string} verdict
 * @param {Map<string, string>} seen action → first verdict
 * @param {string[]} errors
 */
function trackPolicyAction(action, verdict, seen, errors) {
  if (seen.has(action)) {
    errors.push(`policy action assigned to multiple verdicts: '${action}' appears in both '${seen.get(action)}' and '${verdict}'`);
  } else {
    seen.set(action, verdict);
  }
}

/**
 * Validate `policy` sub-object (three-list YAML shape).
 * Accumulates errors — no short-circuit after top-level type guard.
 * @param {unknown} policy
 * @param {string[]} errors
 */
function validatePolicy(policy, errors) {
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
    errors.push('policy must be an object { always, ask, never }');
    return;
  }

  const seen = new Map();

  for (const [verdict, actions] of Object.entries(policy)) {
    if (!VERDICTS.includes(verdict)) {
      errors.push(`unknown policy verdict: '${verdict}' (expected one of ${VERDICTS.join(', ')})`);
      continue;
    }

    if (!Array.isArray(actions)) {
      errors.push(`policy.${verdict} must be a list of action names`);
      continue;
    }

    for (const action of actions) {
      if (!POLICY_ACTIONS.includes(action)) {
        errors.push(`unknown policy action: '${action}' (expected one of ${POLICY_ACTIONS.join(', ')})`);
      } else {
        trackPolicyAction(action, verdict, seen, errors);
      }
    }
  }
}

/**
 * Derive a human-readable label for a pipeline.insert entry.
 * Uses the entry's own `id` when it is a string; falls back to the anchor value
 * (`after`/`before`), then to the numeric index.
 * @param {unknown} entry
 * @param {number} i
 * @returns {string|number}
 */
export function insertLabel(entry, i) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    if (typeof entry.id === 'string' && entry.id !== '') return entry.id;
    if (typeof entry.after === 'string') return `after:${entry.after}`;
    if (typeof entry.before === 'string') return `before:${entry.before}`;
  }
  return i;
}

/**
 * Return the id-validation error message for an insert entry, or null if the id is valid.
 * A valid id is a non-empty, non-whitespace-only string.
 * @param {unknown} entry
 * @param {number} i
 * @returns {string|null}
 */
export function insertIdError(entry, i) {
  const label = insertLabel(entry, i);
  const id = entry?.id;
  if (typeof id !== 'string' || id.trim() === '') {
    return `pipeline.insert[${label}].id must be a non-empty string`;
  }
  return null;
}

/**
 * Validate the `pipeline.insert` value.
 * Each entry must be a plain object owning a non-empty string `id`.
 * Entries that carry a `phase:` key use the nested shape, which is not supported.
 * @param {unknown} insert
 * @param {string[]} errors
 */
function validateInsert(insert, errors) {
  if (!Array.isArray(insert)) {
    errors.push('pipeline.insert must be a list of insert entries');
    return;
  }
  for (const [i, entry] of insert.entries()) {
    const label = insertLabel(entry, i);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`pipeline.insert[${label}] must be an object`);
      continue;
    }
    if (Object.hasOwn(entry, 'phase')) {
      errors.push(`pipeline.insert[${label}]: nested "phase:" form is not supported — use the flat shape { after|before, id, procedure, … }`);
      continue;
    }
    if (!Object.hasOwn(entry, 'id') || typeof entry.id !== 'string' || entry.id === '') {
      errors.push(`pipeline.insert[${label}].id must be a non-empty string`);
    }
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
 * Validate a single technique descriptor element in harness.techniques[].
 * Named sub-keys type-checked; unknown sub-keys allowed (forward-compat).
 * Prototype-pollution keys banned (parity with harness block).
 * @param {unknown} tech
 * @param {string} phaseName
 * @param {number} index
 * @param {string[]} errors
 */
function validateTechnique(tech, phaseName, index, errors) {
  const prefix = `phases.${phaseName}.harness.techniques[${index}]`;
  if (!tech || typeof tech !== 'object' || Array.isArray(tech)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  for (const reserved of RESERVED_HARNESS_KEYS) {
    if (Object.hasOwn(tech, reserved)) {
      errors.push(`${prefix}: reserved key "${reserved}" is not allowed`);
    }
  }
  if (!Object.hasOwn(tech, 'id') || typeof tech.id !== 'string' || tech.id === '') {
    errors.push(`${prefix}.id must be a non-empty string`);
  }
  if (Object.hasOwn(tech, 'mode') && !TECHNIQUE_MODES.has(tech.mode)) {
    errors.push(`${prefix}.mode must be one of: ${[...TECHNIQUE_MODES].join(', ')}`);
  }
  if (Object.hasOwn(tech, 'run-style') && !TECHNIQUE_RUN_STYLES.has(tech['run-style'])) {
    errors.push(`${prefix}.run-style must be one of: ${[...TECHNIQUE_RUN_STYLES].join(', ')}`);
  }
  if (Object.hasOwn(tech, 'scope') && !TECHNIQUE_SCOPES.has(tech.scope)) {
    errors.push(`${prefix}.scope must be one of: ${[...TECHNIQUE_SCOPES].join(', ')}`);
  }
  if (Object.hasOwn(tech, 'probe') && typeof tech.probe !== 'string') {
    errors.push(`${prefix}.probe must be a string`);
  }
  if (Object.hasOwn(tech, 'run') && typeof tech.run !== 'string') {
    errors.push(`${prefix}.run must be a string`);
  }
  if (Object.hasOwn(tech, 'triage-procedure') && typeof tech['triage-procedure'] !== 'string') {
    errors.push(`${prefix}.triage-procedure must be a string`);
  }
  if (Object.hasOwn(tech, 'commit-prefix') && typeof tech['commit-prefix'] !== 'string') {
    errors.push(`${prefix}.commit-prefix must be a string`);
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
  for (const reserved of RESERVED_HARNESS_KEYS) {
    if (Object.hasOwn(harness, reserved)) {
      errors.push(`phases.${phaseName}.harness: reserved key "${reserved}" is not allowed`);
    }
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
  if (Object.hasOwn(harness, 'scope') && typeof harness.scope !== 'string') {
    errors.push(`phases.${phaseName}.harness.scope must be a string`);
  }
  if (Object.hasOwn(harness, 'techniques')) {
    const t = harness.techniques;
    if (!Array.isArray(t)) {
      errors.push(`phases.${phaseName}.harness.techniques must be a list`);
    } else {
      t.forEach((tech, i) => validateTechnique(tech, phaseName, i, errors));
    }
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
  if (Object.hasOwn(pipeline, 'insert')) {
    validateInsert(pipeline.insert, errors);
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
    } else if (field === 'procedure' && (typeof value !== 'string' || value.trim() === '')) {
      errors.push(`phases.${phaseName}.procedure must be a non-empty string`);
    } else if (field === 'enabled' && typeof value !== 'boolean') {
      errors.push(`phases.${phaseName}.enabled must be a boolean`);
    } else if (field === 'required' && typeof value !== 'boolean') {
      errors.push(`phases.${phaseName}.required must be a boolean`);
    } else if (field === 'harness') {
      validateHarness(value, phaseName, errors);
    }
  }
}

/**
 * Validate the `phases` sub-object.
 * Exported for the --harness B4 re-validation call site (pipeline-resolve-main.js).
 * @param {Record<string, unknown>} phases
 * @param {(path: string) => boolean} fileExists
 * @param {string[]} errors
 */
export function validatePhases(phases, fileExists, errors) {
  if (!phases || typeof phases !== 'object' || Array.isArray(phases)) return;
  for (const [phaseName, block] of Object.entries(phases)) {
    if (!PHASE_NAMES.has(resolveAlias(phaseName))) {
      errors.push(`unknown phase: ${phaseName}`);
    }
    validatePhaseBlock(phaseName, block, fileExists, errors);
  }
}

/**
 * Cross-check: a phase cannot be both pipeline.skip'd and phases.<id>.required.
 * Compares canonical ids — pipeline.skip entries and phases keys both resolve via resolveAlias.
 * @param {Record<string, unknown>} manifest
 * @param {string[]} errors
 */
function validateSkipRequiredCollision(manifest, errors) {
  // ?. on manifest itself is redundant: validateManifest returns early for null/undefined
  // before ever calling this function, so manifest is always a plain object here.
  const skip = manifest?.pipeline?.skip;
  const phases = manifest?.phases;
  // typeof phases !== 'object' is redundant: any non-object phases value yields only
  // primitive entries via Object.entries, and those fail the inner typeof block === 'object'
  // check, so no collision can be reported regardless.
  if (!Array.isArray(skip) || !phases || typeof phases !== 'object' || Array.isArray(phases)) return;
  // filter(s => typeof s === 'string') is redundant: non-string skip entries remain
  // non-string after resolveAlias, so they can never Set.has-match a string phase key.
  const skipSet = new Set(skip.filter(s => typeof s === 'string').map(resolveAlias));
  for (const [name, block] of Object.entries(phases)) {
    // typeof block === 'object' is redundant given block.required === true: no truthy
    // non-object value (string, number, function) from YAML/JSON can carry .required === true.
    // Both block && and typeof block === 'object' are needed to guard null (typeof null === 'object').
    if (block && typeof block === 'object' && block.required === true && skipSet.has(resolveAlias(name))) {
      errors.push(
        `phases.${name}.required: true conflicts with pipeline.skip: [${name}] — a phase cannot be both skipped and required`,
      );
    }
  }
}

/**
 * Validate a pre-parsed manifest object.
 * Returns { ok: boolean, errors: string[] }; never throws.
 *
 * @param {Record<string, unknown>|null|undefined} manifest - js-yaml load() output
 * @param {{ fileExists?: (path: string) => boolean, readFile?: (path: string) => string | null }} [opts]
 *   fileExists defaults to "assume present" when omitted; readFile enables structured DoD
 *   sidecar validation when present (default: no DoD content check).
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateManifest(manifest, opts) {
  if (manifest === null || manifest === undefined) return { ok: true, errors: [] };

  const fileExists = typeof opts?.fileExists === 'function' ? opts.fileExists : () => true;
  const readFile = typeof opts?.readFile === 'function' ? opts.readFile : null;
  const errors = [];
  const adapterNames = registeredBacklogNames(manifest.extends);

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
      case 'backlog':
        validateBacklog(value, fileExists, adapterNames, errors);
        break;
      case 'memory':
        validateMemory(value, fileExists, errors);
        break;
      case 'policy':
        validatePolicy(value, errors);
        break;
      case 'extends':
        validateExtends(value, fileExists, errors);
        break;
      case 'paths':
        validatePaths(value, fileExists, errors, readFile);
        break;
      // retrieval, execution: recognized; no sub-validation
    }
  }

  validateSkipRequiredCollision(manifest, errors);

  return { ok: errors.length === 0, errors };
}
