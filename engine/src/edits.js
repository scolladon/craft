/**
 * Edit applicators — apply manifest skip/enable/insert edits to a descriptor list.
 * Pure; immutable transforms only; no I/O.
 */

import { DEFAULT_EXECUTION } from './descriptor.js';

/**
 * Fields from manifest.phases.<id> that are allowed to be applied to a descriptor.
 * Protects engine-controlled invariants (id, archetype, contract, consumes, produces, self_supply).
 */
const ALLOWED_PHASE_OVERRIDE_FIELDS = new Set(['role', 'model', 'harness', 'procedure']);

/**
 * Returns true when v is a plain (non-null, non-array) object.
 * @param {unknown} v
 * @returns {boolean}
 */
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Apply only the whitelisted fields from a phase override to a descriptor.
 * harness is deep-merged one level when both sides are plain objects;
 * otherwise scalar-replaced (null/array/absent → land as-is).
 * @param {object} descriptor
 * @param {object} override
 * @returns {object}
 */
function applyAllowedOverrides(descriptor, override) {
  const patch = {};
  for (const field of ALLOWED_PHASE_OVERRIDE_FIELDS) {
    if (!Object.hasOwn(override, field)) continue;
    if (field === 'harness' && isPlainObject(descriptor[field]) && isPlainObject(override[field])) {
      patch[field] = { ...descriptor[field], ...override[field] };
    } else {
      patch[field] = override[field];
    }
  }
  return { ...descriptor, ...patch };
}

/**
 * Apply skip + phase-level enable/disable overrides to the default descriptor list.
 * Returns `{ descriptors, records }` — a pure value; input descriptors are never mutated.
 *
 * @param {readonly object[]} defaults
 * @param {Set<string>} skipSet
 * @param {Map<string, object>} phaseOverrides
 * @returns {{ descriptors: object[], records: string[] }}
 */
export function applyEnableEdits(defaults, skipSet, phaseOverrides) {
  const records = [];

  const descriptors = defaults.map(d => {
    const override = phaseOverrides.get(d.id) ?? {};
    const explicitSkip = skipSet.has(d.id);
    const explicitEnable = override.enabled === true;
    const explicitDisable = override.enabled === false;

    let enabled = d.enabled;

    if (explicitSkip) {
      enabled = false;
      records.push(`skip: ${d.id} (manifest pipeline.skip)`);
    } else if (explicitEnable && !d.enabled) {
      enabled = true;
      records.push(`enable: ${d.id} (phases.${d.id}.enabled:true)`);
    } else if (explicitDisable && d.enabled) {
      enabled = false;
      records.push(`disable: ${d.id} (phases.${d.id}.enabled:false)`);
    } else if (!d.enabled) {
      records.push(`default-skip: ${d.id} (descriptor enabled:false)`);
    }

    return { ...applyAllowedOverrides(d, override), enabled };
  });

  return { descriptors, records };
}

/**
 * Describe the insert position for the record.
 * @param {string|undefined} after
 * @param {string|undefined} before
 * @returns {string}
 */
function insertLocation(after, before) {
  if (after !== undefined) return `after:${after}`;
  if (before !== undefined) return `before:${before}`;
  return 'append';
}

/**
 * Insert new descriptors from manifest.pipeline.insert into the descriptor list.
 * Returns `{ descriptors, records }` — a pure value; input descriptors are never mutated.
 *
 * @param {object[]} descriptors
 * @param {object[]} inserts
 * @returns {{ descriptors: object[], records: string[] }}
 */
export function applyInserts(descriptors, inserts) {
  if (!inserts || inserts.length === 0) return { descriptors, records: [] };

  const records = [];
  let result = [...descriptors];

  for (const ins of inserts) {
    const { after, before, ...phaseData } = ins;

    const newDescriptor = {
      enabled: true,
      contract: [],
      consumes: [],
      produces: [],
      self_supply: [],
      execution: DEFAULT_EXECUTION,
      ...phaseData,
    };

    let insertIdx = result.length; // default: append at end

    if (after !== undefined) {
      const refIdx = result.findIndex(d => d.id === after);
      if (refIdx !== -1) insertIdx = refIdx + 1;
    } else if (before !== undefined) {
      const refIdx = result.findIndex(d => d.id === before);
      if (refIdx !== -1) insertIdx = refIdx;
    }

    result = [
      ...result.slice(0, insertIdx),
      newDescriptor,
      ...result.slice(insertIdx),
    ];

    records.push(`insert: ${newDescriptor.id} (${insertLocation(after, before)})`);
  }

  return { descriptors: result, records };
}

/**
 * Check whether all ids in reorderList are valid targets (known + enabled, no duplicates).
 * Pure query — returns string[] of all accumulated errors (no short-circuit).
 *
 * @param {object[]} descriptors
 * @param {string[]} reorderList
 * @returns {string[]}
 */
export function checkReorderApplicability(descriptors, reorderList) {
  if (!reorderList || reorderList.length === 0) return [];
  const byId = new Map(descriptors.map(d => [d.id, d]));
  const seen = new Set();
  const errors = [];
  for (const id of reorderList) {
    const descriptor = byId.get(id);
    if (!descriptor) {
      errors.push(`reorder: unknown id "${id}" — not present in the post-insert descriptor list`);
    } else if (!descriptor.enabled) {
      errors.push(`reorder: "${id}" is not enabled — only enabled phases may be reordered`);
    }
    if (seen.has(id)) {
      errors.push(`reorder: duplicate id "${id}" in pipeline.reorder list`);
    }
    seen.add(id);
  }
  return errors;
}

/**
 * Permute descriptors so that reorderList ids occupy the slots previously held by those same ids.
 * Pure command — returns `{ descriptors, records }`. Never returns errors (CQS).
 * Empty list = no-op. Input array is never mutated.
 *
 * @param {object[]} descriptors
 * @param {string[]} reorderList
 * @returns {{ descriptors: object[], records: string[] }}
 */
export function applyReorder(descriptors, reorderList) {
  if (!reorderList || reorderList.length === 0) return { descriptors, records: [] };
  const reorderSet = new Set(reorderList);
  const byId = new Map(descriptors.map(d => [d.id, d]));
  const slots = descriptors.reduce((acc, d, i) => {
    if (reorderSet.has(d.id)) acc.push(i);
    return acc;
  }, []);
  const reordered = [...descriptors];
  for (let k = 0; k < slots.length; k++) {
    reordered[slots[k]] = byId.get(reorderList[k]);
  }
  const records = reorderList.map(id => `reorder: ${id} (pipeline.reorder)`);
  return { descriptors: reordered, records };
}
