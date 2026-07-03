/**
 * manifest-harness — harness/technique block validators and the Sets they alone use (ADR-030).
 */

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
export function validateHarness(harness, phaseName, errors) {
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
