import { load } from 'js-yaml';

/** @typedef {'setup'|'specification'|'construction'|'harness'|'refinement'|'delivery'} Archetype */

const VALID_ARCHETYPES = new Set([
  'setup', 'specification', 'construction', 'harness', 'refinement', 'delivery',
]);

const REQUIRED_FIELDS = ['id', 'archetype', 'contract', 'procedure'];

const DEFAULT_EXECUTION = 'agent';
const VALID_EXECUTIONS = new Set([DEFAULT_EXECUTION, 'inline']);

/**
 * Coerce a YAML scalar-or-list field to a string array. Elements are stringified
 * so an implicit YAML type (e.g. a bare date) cannot leak a non-string into the
 * descriptor.
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeStringArray(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

/**
 * Recursively freeze an object graph so a parsed descriptor is fully immutable.
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const member of Object.values(value)) deepFreeze(member);
  return Object.freeze(value);
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

  const execution = raw.execution === undefined ? DEFAULT_EXECUTION : String(raw.execution);
  if (!VALID_EXECUTIONS.has(execution)) {
    throw new Error(
      `Descriptor at index ${index} (id="${raw.id}"): execution "${execution}" is not valid. ` +
      `Must be one of: ${[...VALID_EXECUTIONS].join(', ')}.`,
    );
  }

  const entry = {
    id: String(raw.id),
    archetype,
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    contract: normalizeStringArray(raw.contract),
    procedure: String(raw.procedure),
    consumes: normalizeStringArray(raw.consumes),
    self_supply: normalizeStringArray(raw.self_supply),
    produces: normalizeStringArray(raw.produces),
    execution,
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
    return deepFreeze(normalizeEntry(entry, index));
  });

  return Object.freeze(descriptors);
}
