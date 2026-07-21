/**
 * manifest-pipeline-edits — pipeline.insert/reorder validators and their id helpers.
 */

import { PIPELINE_KEYS } from './manifest-vocabulary.js';

/**
 * Derive a human-readable label for a pipeline.insert entry.
 * Uses the entry's own `id` when it is a string; falls back to the anchor value
 * (`after`/`before`), then to the numeric index.
 * @param {unknown} entry
 * @param {number} i
 * @returns {string|number}
 */
export function insertLabel(entry, i) {
  // equivalent mutant (ConditionalExpression: `typeof entry === 'object'` → `true`):
  // the guarded branch only reads entry.id/.after/.before — a primitive entry has none
  // of those own properties, so it falls through to the same `return i` regardless.
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
 * Validate the `pipeline` sub-object keys.
 * Named distinctly from the graph's exported `validatePipeline(descriptors)`:
 * this checks manifest-shape sub-keys, not the descriptor DAG.
 * @param {Record<string, unknown>} pipeline
 * @param {string[]} errors
 */
export function validatePipelineKeys(pipeline, errors) {
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
