/**
 * Structured DoD (Definition of Done) sidecar parser and criterion verifier.
 * Pure — no I/O. All file reads and gate evidence are injected.
 * Never throws; advisory parse returns null on any malformation.
 */

import { extractFrontmatter } from './frontmatter.js';
import { load } from 'js-yaml';

const VALID_KINDS = Object.freeze(new Set(['auto', 'judgment']));

/**
 * Parse a DoD file's content.
 *
 * - Free-text (no frontmatter) → null.
 * - Frontmatter without a `criteria` key → null.
 * - No frontmatter → null (free-text; never throws).
 * - Frontmatter present but malformed YAML → throws (author error, surfaced loud).
 * - Structured: returns { criteria: Criterion[] }.
 *
 * Back-compat: an existing free-text DoD file (docs/DOD.md) has no frontmatter
 * and returns null — callers treat null as "no structured criteria". A file that
 * opens a frontmatter block but mis-types it is a genuine mistake and fails loud
 * rather than silently degrading to free-text.
 *
 * @param {string} content
 * @returns {{ criteria: object[] } | null}
 * @throws {Error} when a present frontmatter block is not valid YAML
 */
export function parseDod(content) {
  const block = extractFrontmatter(content);
  if (block === null) return null; // equivalent mutant (false): js-yaml load(null) returns null; L41 !parsed catches it → same return null

  let parsed;
  try {
    parsed = load(block);
  } catch (e) {
    throw new Error(`dod: malformed YAML frontmatter — ${e.message}`);
  }

  // equivalent mutant (&&): (!parsed && typeof...) — all falsy values caught by !parsed; equivalent mutant (remove typeof): primitives have no 'criteria' own property so !hasOwn catches them
  if (!parsed || typeof parsed !== 'object' || !Object.hasOwn(parsed, 'criteria')) return null;
  return { criteria: parsed.criteria };
}

/**
 * Validate the shape of a DoD criteria array.
 * Accumulates errors; never throws.
 *
 * Each criterion must have:
 *   - id: non-empty string
 *   - kind: 'auto' | 'judgment'
 *   - auto criterion must have assert with a string gate or a string file-exists field
 *
 * @param {unknown} criteria
 * @returns {string[]}
 */
export function validateDodCriteria(criteria) {
  if (!Array.isArray(criteria)) return ['dod.criteria must be an array'];

  const errors = [];
  for (const [i, crit] of criteria.entries()) {
    const prefix = `dod.criteria[${i}]`;
    if (!crit || typeof crit !== 'object') {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof crit.id !== 'string' || crit.id.trim() === '') {
      errors.push(`${prefix}.id must be a non-empty string`);
    }
    if (!VALID_KINDS.has(crit.kind)) {
      errors.push(`${prefix}.kind must be 'auto' or 'judgment'`);
    }
    if (crit.kind === 'auto') {
      validateAutoAssert(crit, prefix, errors);
    }
  }
  return errors;
}

/**
 * Validate the assert sub-object for an auto criterion.
 * @param {object} crit
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateAutoAssert(crit, prefix, errors) {
  const assertObj = crit.assert;
  if (!assertObj || typeof assertObj !== 'object') {
    errors.push(`${prefix}: auto criterion requires an 'assert' object`);
    return;
  }
  const hasGate = Object.hasOwn(assertObj, 'gate');
  const hasFile = Object.hasOwn(assertObj, 'file-exists');
  if (!hasGate && !hasFile) {
    errors.push(`${prefix}.assert must have a 'gate' or 'file-exists' key`);
    return;
  }
  if (hasGate && hasFile) {
    errors.push(`${prefix}.assert must not have both 'gate' and 'file-exists'`);
    return;
  }
  if (hasGate && typeof assertObj.gate !== 'string') {
    errors.push(`${prefix}.assert.gate must be a string`);
  }
  if (hasFile && typeof assertObj['file-exists'] !== 'string') {
    errors.push(`${prefix}.assert['file-exists'] must be a string`);
  }
}

/**
 * Assert DoD criteria against engine-recorded evidence.
 *
 * Returns an outcome for each criterion:
 *   - 'met' | 'unmet' for auto criteria (based on injected evidence only)
 *   - 'judgment' for judgment criteria (human-asserted, not auto-checkable)
 *
 * Injection-safety: a stray `command` or `run` field on any criterion is ignored.
 * Assertion uses gate and file-exists evidence only — never executes anything.
 * A `gate` criterion references engine-recorded evidence by phase-id: a contributor
 * cannot inject a command and cannot assert green for a gate that ran red. A
 * `file-exists` criterion is a repo-contained existence check — the caller MUST supply
 * a containment-bound `fileExists` (e.g. one that rejects paths escaping the repo root)
 * so the existence probe cannot be aimed outside the repo.
 *
 * Engine-internal: consumed by the validation skill (skills/validation/SKILL.md);
 * there is no in-process JS caller of this function today.
 *
 * @param {object[]} criteria
 * @param {{ gateGreen: (phaseId: string) => boolean | undefined, fileExists: (path: string) => boolean }} evidence
 * @returns {('met' | 'unmet' | 'judgment')[]}
 */
export function assertDodCriteria(criteria, evidence) {
  return criteria.map(crit => {
    if (crit.kind === 'judgment') return 'judgment';
    return assertAutoCriterion(crit, evidence);
  });
}

/**
 * Assert a single auto criterion using injected evidence.
 * Never executes any field that might appear on the criterion object.
 * @param {object} crit
 * @param {{ gateGreen: (phaseId: string) => boolean | undefined, fileExists: (path: string) => boolean }} evidence
 * @returns {'met' | 'unmet'}
 */
function assertAutoCriterion(crit, evidence) {
  const assertObj = crit.assert;
  if (!assertObj) return 'unmet';

  if (Object.hasOwn(assertObj, 'gate')) {
    return evidence.gateGreen(assertObj.gate) === true ? 'met' : 'unmet';
  }

  if (Object.hasOwn(assertObj, 'file-exists')) {
    return evidence.fileExists(assertObj['file-exists']) ? 'met' : 'unmet';
  }

  return 'unmet';
}
