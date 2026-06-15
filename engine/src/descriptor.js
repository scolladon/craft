import { load } from 'js-yaml';

/** @typedef {'setup'|'specification'|'construction'|'harness'|'refinement'|'delivery'} Archetype */

const VALID_ARCHETYPES = new Set([
  'setup', 'specification', 'construction', 'harness', 'refinement', 'delivery',
]);

const REQUIRED_FIELDS = ['id', 'archetype', 'procedure'];

/**
 * Normalize a contract value to a string array.
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeContract(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return [String(value)];
}

/**
 * Coerce an optional list field to a string array.
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return [String(value)];
}

/**
 * Validate and apply defaults to a single raw descriptor entry.
 * Throws a descriptive Error on any violation.
 * @param {Record<string, unknown>} raw
 * @param {number} index
 * @returns {object}
 */
function normalizeEntry(raw, index) {
  for (const field of REQUIRED_FIELDS) {
    if (raw[field] === undefined || raw[field] === null) {
      throw new Error(
        `Descriptor at index ${index}: required field "${field}" is missing.`,
      );
    }
  }

  const archetype = String(raw.archetype);
  if (!VALID_ARCHETYPES.has(archetype)) {
    throw new Error(
      `Descriptor at index ${index} (id="${raw.id}"): archetype "${archetype}" is not valid. ` +
      `Must be one of: ${[...VALID_ARCHETYPES].join(', ')}.`,
    );
  }

  const entry = {
    id: String(raw.id),
    archetype,
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    contract: normalizeContract(raw.contract),
    procedure: String(raw.procedure),
    consumes: normalizeList(raw.consumes),
    self_supply: normalizeList(raw.self_supply),
    produces: normalizeList(raw.produces),
    execution: raw.execution === undefined ? 'agent' : String(raw.execution),
  };

  if (raw.role !== undefined && raw.role !== null) {
    entry.role = String(raw.role);
  }

  if (raw.gate !== undefined && raw.gate !== null) {
    entry.gate = String(raw.gate);
  }

  if (raw.harness !== undefined && raw.harness !== null) {
    entry.harness = raw.harness;
  }

  return entry;
}

/**
 * Parse YAML pipeline text into a frozen array of normalized Descriptor objects.
 * Throws a descriptive Error on malformed input.
 *
 * @param {string} yamlText
 * @returns {readonly object[]}
 */
export function parsePipeline(yamlText) {
  const raw = load(yamlText);

  if (!Array.isArray(raw)) {
    throw new Error('Pipeline YAML must be a list of descriptor objects.');
  }

  const descriptors = raw.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Descriptor at index ${index} must be an object, got ${typeof entry}.`);
    }
    return normalizeEntry(entry, index);
  });

  return Object.freeze(descriptors);
}
