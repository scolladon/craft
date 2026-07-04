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
import {
  TOP_KEYS,
  PHASE_NAMES,
  PHASE_FIELDS,
  GATE_FIELDS,
  PR_FIELDS,
  SCRIPT_FIELDS,
  MODELS_KEYS,
  DEPRECATED_AGENT_NAMES,
  BACKLOG_SOURCES,
  MEMORY_SOURCES,
  INTENTION_SOURCES,
  INTENTION_GATES,
  HYGIENE_GATES,
} from './manifest-vocabulary.js';
import { validateHarness } from './manifest-harness.js';
import { validatePipelineKeys } from './manifest-pipeline-edits.js';

export { registeredBacklogNames } from './extends-validation.js';
export { RESERVED_HARNESS_KEYS } from './manifest-harness.js';
export { insertIdError } from './manifest-pipeline-edits.js';

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

/** Non-built-in intention source values that get a targeted hint instead of the generic error. */
const NON_BUILTIN_INTENTION = Object.freeze(new Set(['rag', 'wiki', 'notion', 'confluence', 'code-graph']));

/**
 * True when value is a list (possibly empty) of non-empty strings.
 * @param {unknown} value
 * @returns {boolean}
 */
function isListOfNonEmptyStrings(value) {
  return Array.isArray(value) && value.every(v => typeof v === 'string' && v.trim() !== '');
}

/**
 * Validate the `intention` sub-object.
 * @param {unknown} intention
 * @param {(path: string) => boolean} fileExists
 * @param {string[]} errors
 */
function validateIntention(intention, fileExists, errors) {
  if (typeof intention !== 'object' || intention === null || Array.isArray(intention)) {
    errors.push('intention must be an object { source, ref, gate, covers }');
    return;
  }

  for (const k of Object.keys(intention)) {
    if (k !== 'source' && k !== 'ref' && k !== 'gate' && k !== 'covers') {
      errors.push(`unknown intention field: ${k}`);
    }
  }

  const { source, ref, gate, covers } = intention;

  if (source === undefined) {
    errors.push('intention must declare a source (one of file, custom)');
    return;
  }

  if (!INTENTION_SOURCES.has(source)) {
    if (NON_BUILTIN_INTENTION.has(source)) {
      errors.push(`intention source '${source}' is not built-in — use source: custom with a ref to a resolver script`);
    } else {
      errors.push(`unknown intention source: ${source} (expected one of file, custom)`);
    }
    return;
  }

  if (gate !== undefined && !INTENTION_GATES.has(gate)) {
    errors.push(`unknown intention gate: ${gate} (expected one of advisory, blocking)`);
  }

  if (covers !== undefined && !isListOfNonEmptyStrings(covers)) {
    errors.push('intention.covers must be a list of non-empty strings');
  }

  if (source === 'file') {
    checkFileRef('intention.ref', ref, fileExists, errors);
  // equivalent mutant (ConditionalExpression: `source === 'custom'` → `true`):
  // reached only when source !== 'file' and L246 already narrowed source to
  // {file, custom} via INTENTION_SOURCES.has(source) — so source is always
  // 'custom' here regardless; same behavior for every input.
  } else if (source === 'custom') {
    if (typeof ref !== 'string' || ref.trim() === '') {
      errors.push('intention.ref is required for source custom');
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

function validateHygiene(hygiene, errors) {
  if (typeof hygiene !== 'object' || hygiene === null || Array.isArray(hygiene)) {
    errors.push('hygiene must be an object { gate }');
    return;
  }
  for (const k of Object.keys(hygiene)) {
    if (k !== 'gate') errors.push(`unknown hygiene field: ${k}`);
  }
  const { gate } = hygiene;
  if (gate !== undefined && !HYGIENE_GATES.has(gate)) {
    errors.push(`unknown hygiene gate: ${gate} (expected one of advisory, blocking)`);
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
      case 'intention':
        validateIntention(value, fileExists, errors);
        break;
      case 'policy':
        validatePolicy(value, errors);
        break;
      case 'hygiene':
        validateHygiene(value, errors);
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
