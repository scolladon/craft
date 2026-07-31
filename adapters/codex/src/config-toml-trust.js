/**
 * Targeted upsert of the hook-trust hash into codex's `config.toml`, without
 * a TOML parser: the file is the operator's own, and parsing then rewriting
 * the whole document would touch lines this change has no business touching.
 * This only ever locates one `[hooks.state.<key>]` table by exact header
 * match and edits its `trusted_hash` assignment, leaving every other byte in
 * the file untouched.
 */

import { escapeControlChars } from './safe-text.js';

const TABLE_HEADER_PREFIX = '[hooks.state.';
const TABLE_HEADER_SUFFIX = ']';
const TABLE_BOUNDARY_CHAR = '[';
const TRUSTED_HASH_KEY = 'trusted_hash';
const TRUSTED_HASH_ASSIGNMENT_PATTERN = /^\s*trusted_hash\s*=/;

/**
 * Quote and escape a string as a TOML basic string: usable both as a quoted
 * dotted-key segment (why `/` and `:` are left bare — they need no escape,
 * only the mandatory quoting a bare key with those characters would lack)
 * and as a basic-string value, since both follow identical escaping rules.
 *
 * Escape order is load-bearing: backslash must escape first, or the escapes
 * the later passes emit would themselves be re-escaped by the backslash
 * pass.
 *
 * @param {string} key
 * @returns {string}
 */
export function toQuotedTomlKey(key) {
  const backslashEscaped = key.replace(/\\/g, '\\\\');
  const quoteEscaped = backslashEscaped.replace(/"/g, '\\"');
  const controlEscaped = escapeControlChars(quoteEscaped);
  return `"${controlEscaped}"`;
}

function buildHeaderLine(key) {
  return `${TABLE_HEADER_PREFIX}${toQuotedTomlKey(key)}${TABLE_HEADER_SUFFIX}`;
}

function buildAssignmentLine(hash) {
  return `${TRUSTED_HASH_KEY} = ${toQuotedTomlKey(hash)}`;
}

/**
 * A table's extent runs from the line after its header to the next table
 * header, or end of text. The boundary test trims before inspecting the `[`,
 * symmetric with the header lookup below: an indented table header is legal
 * TOML, and a boundary rule that missed one would let this table's extent run
 * into the NEXT table and edit its keys. Shared by both the replace and the
 * insert routes so the boundary rule exists in exactly one place.
 */
function findTableExtent(lines, headerIndex) {
  const start = headerIndex + 1;
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith(TABLE_BOUNDARY_CHAR)) {
      return { start, end: index };
    }
  }
  return { start, end: lines.length };
}

function findTrustedHashIndices(lines, { start, end }) {
  const indices = [];
  for (let index = start; index < end; index += 1) {
    if (TRUSTED_HASH_ASSIGNMENT_PATTERN.test(lines[index])) {
      indices.push(index);
    }
  }
  return indices;
}

function findHeaderIndex(lines, headerLine) {
  return lines.findIndex((line) => line.trim() === headerLine);
}

function replaceOrInsertAssignment(lines, headerIndex, assignmentLine) {
  const extent = findTableExtent(lines, headerIndex);
  const indices = findTrustedHashIndices(lines, extent);

  if (indices.length > 1) {
    // A duplicate key is already invalid TOML; guessing which occurrence to
    // replace would silently paper over a config the operator needs to fix.
    throw new Error(
      `upsertTrustedHash: table already carries ${indices.length} trusted_hash assignments, refusing to guess which one to replace`
    );
  }

  const nextLines = [...lines];
  if (indices.length === 1) {
    nextLines[indices[0]] = assignmentLine;
  } else {
    nextLines.splice(extent.start, 0, assignmentLine);
  }
  return nextLines.join('\n');
}

function appendTable(tomlText, headerLine, assignmentLine) {
  const block = `${headerLine}\n${assignmentLine}\n`;
  if (tomlText.trim().length === 0) {
    return block;
  }
  const terminated = tomlText.endsWith('\n') ? tomlText : `${tomlText}\n`;
  return `${terminated}\n${block}`;
}

// The write is what makes the guard enforceable, so the produced text is
// re-read before it is handed back. Unless the target table ends up carrying
// exactly the assignment just written, this refuses rather than returning a
// config whose success message would claim a trust the file does not record.
function assertTargetTableCarriesAssignment(tomlText, headerLine, assignmentLine) {
  const lines = tomlText.split('\n');
  const headerIndex = findHeaderIndex(lines, headerLine);
  if (headerIndex === -1) {
    throw new Error(`upsertTrustedHash: produced text carries no ${headerLine} table`);
  }

  const indices = findTrustedHashIndices(lines, findTableExtent(lines, headerIndex));
  if (indices.length !== 1 || lines[indices[0]] !== assignmentLine) {
    throw new Error(
      `upsertTrustedHash: produced text carries ${indices.length} trusted_hash assignment(s) in ${headerLine}, expected exactly the one written`
    );
  }
}

/**
 * Upsert the hook-trust hash for `key` into `tomlText`'s
 * `[hooks.state.<key>]` table, returning new text. Never mutates the input
 * string, never touches another table, never reorders or deletes a line it
 * did not write itself.
 *
 * @param {string} tomlText
 * @param {{ key: string, hash: string }} params
 * @returns {string}
 */
export function upsertTrustedHash(tomlText, { key, hash }) {
  const headerLine = buildHeaderLine(key);
  const assignmentLine = buildAssignmentLine(hash);
  const lines = tomlText.split('\n');
  const headerIndex = findHeaderIndex(lines, headerLine);

  const nextText =
    headerIndex === -1
      ? appendTable(tomlText, headerLine, assignmentLine)
      : replaceOrInsertAssignment(lines, headerIndex, assignmentLine);

  assertTargetTableCarriesAssignment(nextText, headerLine, assignmentLine);
  return nextText;
}
