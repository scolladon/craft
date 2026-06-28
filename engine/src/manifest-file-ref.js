/**
 * Shared file-ref validation leaf used across manifest validators.
 * Pure; no I/O — file-existence checks are injected via fileExists.
 */

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
export function checkFileRef(label, value, fileExists, errors) {
  if (isAbsentPath(value)) return;
  for (const path of toStringArray(value)) {
    if (isAbsentPath(path)) continue;
    if (!fileExists(path)) {
      errors.push(`${label} references missing file: ${path}`);
    }
  }
}
