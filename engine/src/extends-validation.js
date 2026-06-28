/**
 * Validators for the `extends` top-level manifest block and the
 * backlog-adapter name registry.
 * Pure; no I/O — file-existence checks are injected via fileExists.
 */

import { checkFileRef } from './manifest-file-ref.js';
import { VALID_ARCHETYPES } from './descriptor.js';
import { BUNDLE_VOCAB } from './graph.js';

/** Accepted keys in the `extends` top-level block. */
const EXTENDS_KEYS = Object.freeze(new Set(['phases', 'agents', 'profiles', 'backlog-adapters']));

/** Accepted execution mode values for profile entries. */
const PROFILE_EXECUTION_VALUES = Object.freeze(new Set(['inline', 'agent']));

/**
 * Collect the registered backlog adapter names from an extends block.
 * @param {unknown} extendsBlock
 * @returns {Set<string>}
 */
export function registeredBacklogNames(extendsBlock) {
  const adapters = extendsBlock?.['backlog-adapters'];
  if (!Array.isArray(adapters)) return new Set();
  return new Set(adapters.map(a => a?.name).filter(n => typeof n === 'string' && n.trim() !== ''));
}

/**
 * Validate the optional string fields of a registered phase entry.
 * @param {object} phase
 * @param {number} i
 * @param {string[]} errors
 */
function validateExtendsPhaseOptionalStrings(phase, i, errors) {
  for (const field of ['role', 'gate', 'after', 'before']) {
    const val = phase[field];
    if (val !== undefined && typeof val !== 'string') {
      errors.push(`extends.phases[${i}].${field} must be a string`);
    }
  }
}

/**
 * Validate one registered phase entry in `extends.phases`.
 * @param {unknown} phase
 * @param {number} i
 * @param {string[]} errors
 */
function validateExtendsPhaseEntry(phase, i, errors) {
  if (!phase || typeof phase !== 'object' || Array.isArray(phase)) {
    errors.push(`extends.phases[${i}] must be an object`);
    return;
  }
  const { id, procedure, archetype, contract, consumes, produces } = phase;

  if (typeof id !== 'string' || id.trim() === '') {
    errors.push(`extends.phases[${i}].id must be a non-empty string`);
  }
  if (typeof procedure !== 'string' || procedure.trim() === '') {
    errors.push(`extends.phases[${i}].procedure must be a non-empty string`);
  }
  // NoCoverage note: typeof guard is redundant — VALID_ARCHETYPES.has(nonString) returns false for any non-string, so !has alone covers non-strings; kept for defensive intent.
  if (archetype !== undefined && (typeof archetype !== 'string' || !VALID_ARCHETYPES.has(archetype))) {
    errors.push(`extends.phases[${i}].archetype, when present, must be one of ${[...VALID_ARCHETYPES].join(', ')}`);
  }
  validateExtendsPhaseContract(contract, i, errors);
  validateExtendsPhaseStringArray(consumes, `extends.phases[${i}].consumes`, errors);
  validateExtendsPhaseStringArray(produces, `extends.phases[${i}].produces`, errors);
  validateExtendsPhaseOptionalStrings(phase, i, errors);
}

/**
 * Validate the `contract` field of a registered phase entry.
 * Must be an array, and every element must be in BUNDLE_VOCAB.
 * @param {unknown} contract
 * @param {number} i
 * @param {string[]} errors
 */
function validateExtendsPhaseContract(contract, i, errors) {
  if (contract === undefined) return;
  if (!Array.isArray(contract)) {
    errors.push(`extends.phases[${i}].contract must be an array`);
    return;
  }
  for (const [j, bundle] of contract.entries()) {
    if (!BUNDLE_VOCAB.has(bundle)) {
      errors.push(`extends.phases[${i}].contract[${j}]: "${bundle}" is not a known bundle (expected one of ${[...BUNDLE_VOCAB].join(', ')})`);
    }
  }
}

/**
 * Validate that a field is an array of strings, if present.
 * @param {unknown} value
 * @param {string} label
 * @param {string[]} errors
 */
function validateExtendsPhaseStringArray(value, label, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array`);
    return;
  }
  for (const [i, item] of value.entries()) {
    if (typeof item !== 'string') {
      errors.push(`${label}[${i}] must be a string`);
    }
  }
}

/**
 * Validate the `extends.phases` sub-block.
 * @param {unknown} phases
 * @param {string[]} errors
 */
function validateExtendsPhases(phases, errors) {
  if (!Array.isArray(phases)) {
    errors.push('extends.phases must be an array');
    return;
  }
  for (const [i, phase] of phases.entries()) {
    validateExtendsPhaseEntry(phase, i, errors);
  }
}

/**
 * Validate the `extends.agents` sub-block.
 * @param {unknown} agents
 * @param {string[]} errors
 */
function validateExtendsAgents(agents, errors) {
  if (!Array.isArray(agents)) {
    errors.push('extends.agents must be an array');
    return;
  }
  for (const [i, ref] of agents.entries()) {
    if (typeof ref !== 'string' || ref.trim() === '') {
      errors.push(`extends.agents[${i}] must be a string`);
    }
  }
}

/**
 * Validate one named profile entry in `extends.profiles`.
 * All six archetype keys are required; values must be "inline" or "agent".
 * @param {unknown} value
 * @param {string} name
 * @param {string[]} errors
 */
function validateExtendsProfileEntry(value, name, errors) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`extends.profiles.${name} must be an object`);
    return;
  }
  for (const archetype of VALID_ARCHETYPES) {
    if (!Object.hasOwn(value, archetype)) {
      errors.push(`extends.profiles.${name}: missing archetype "${archetype}"`);
    } else if (!PROFILE_EXECUTION_VALUES.has(value[archetype])) {
      errors.push(`extends.profiles.${name}: value for "${archetype}" must be inline|agent, got "${value[archetype]}"`);
    }
  }
}

/**
 * Validate the `extends.profiles` sub-block.
 * @param {unknown} profiles
 * @param {string[]} errors
 */
function validateExtendsProfiles(profiles, errors) {
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    errors.push('extends.profiles must be an object');
    return;
  }
  for (const [name, value] of Object.entries(profiles)) {
    validateExtendsProfileEntry(value, name, errors);
  }
}

/**
 * Validate the `extends.backlog-adapters` sub-block.
 * @param {unknown} adapters
 * @param {(path: string) => boolean} fileExists
 * @param {string[]} errors
 */
function validateExtendsBacklogAdapters(adapters, fileExists, errors) {
  if (!Array.isArray(adapters)) {
    errors.push('extends.backlog-adapters must be an array');
    return;
  }
  for (const [i, adapter] of adapters.entries()) {
    if (!adapter || typeof adapter !== 'object' || Array.isArray(adapter)) {
      errors.push(`extends.backlog-adapters[${i}] must be an object`);
      continue;
    }
    const { name, ref } = adapter;
    if (typeof name !== 'string' || name.trim() === '') {
      errors.push(`extends.backlog-adapters[${i}].name must be a non-empty string`);
    }
    if (typeof ref !== 'string' || ref.trim() === '') {
      errors.push(`extends.backlog-adapters[${i}].ref must be a non-empty string`);
    } else {
      checkFileRef(`extends.backlog-adapters[${i}].ref`, ref, fileExists, errors);
    }
  }
}

/**
 * Validate the `extends` top-level block.
 * @param {unknown} extendsBlock
 * @param {(path: string) => boolean} fileExists
 * @param {string[]} errors
 */
export function validateExtends(extendsBlock, fileExists, errors) {
  if (!extendsBlock || typeof extendsBlock !== 'object' || Array.isArray(extendsBlock)) {
    errors.push('extends must be an object');
    return;
  }
  for (const k of Object.keys(extendsBlock)) {
    if (!EXTENDS_KEYS.has(k)) {
      errors.push(`unknown extends sub-key: ${k}`);
    }
  }
  if (Object.hasOwn(extendsBlock, 'phases')) {
    validateExtendsPhases(extendsBlock.phases, errors);
  }
  if (Object.hasOwn(extendsBlock, 'agents')) {
    validateExtendsAgents(extendsBlock.agents, errors);
  }
  if (Object.hasOwn(extendsBlock, 'profiles')) {
    validateExtendsProfiles(extendsBlock.profiles, errors);
  }
  if (Object.hasOwn(extendsBlock, 'backlog-adapters')) {
    validateExtendsBacklogAdapters(extendsBlock['backlog-adapters'], fileExists, errors);
  }
}
