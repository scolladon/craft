/**
 * Stub alias map — filled in slice 6.
 * Provides the identity resolver so index.js can re-export without ERR_MODULE_NOT_FOUND.
 */

export const ALIAS_MAP = Object.freeze({});

/**
 * Resolve a phase name to its canonical id.
 * Identity function until slice 6 populates the map.
 *
 * @param {string} name
 * @returns {string}
 */
export const resolveAlias = (name) => name;
