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
// A table header is a whole line: brackets around a key, nothing after it but
// whitespace or a comment. Testing only for a leading `[` also fires on an array
// element sitting on its own continuation line, which ends the table early — see
// findTableExtent for what that costs. The key span reads a quoted segment whole,
// escapes included, because the keys written here embed a filesystem path: a `]`
// in that path is legal and belongs to the key, and a `"` in it arrives escaped.
const TABLE_HEADER_LINE_PATTERN = /^\[\[?(?:[^\]"]|"(?:[^"\\]|\\.)*")*\]\]?\s*(#.*)?$/;
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
 * header, or end of text. Two failure directions bound the rule, and both have
 * been paid for: a boundary that misses a header lets this table's extent run
 * into the NEXT table and edit its keys, while a boundary that fires on any
 * line-initial `[` ends the extent at an array continuation line, misses this
 * table's own trusted_hash and appends a duplicate key. Trimming before the
 * match handles the first (an indented header is legal TOML); requiring the
 * whole line to be header-shaped handles the second.
 *
 * The rule is line-shaped, not a TOML parse, so a line that is both a valid
 * header and a valid array element (`["a"]`) is read as a header. Shared by
 * both the replace and the insert routes so it exists in exactly one place.
 */
function findTableExtent(lines, headerIndex) {
  const start = headerIndex + 1;
  for (let index = start; index < lines.length; index += 1) {
    if (TABLE_HEADER_LINE_PATTERN.test(lines[index].trim())) {
      return { start, end: index };
    }
  }
  return { start, end: lines.length };
}

function findTrustedHashIndices(lines, { start, end }) {
  const indices = [];
  // equivalent mutant (EqualityOperator <=): the one extra line an inclusive
  // bound would scan is either past the last index — undefined, which the
  // pattern rejects — or the boundary line itself, and findTableExtent only
  // ever stops on a line whose first non-whitespace character is `[`, while an
  // assignment line's is `t`. No line can be both, so the extra scan can never
  // add an index.
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

  return headerIndex === -1
    ? appendTable(tomlText, headerLine, assignmentLine)
    : replaceOrInsertAssignment(lines, headerIndex, assignmentLine);
}
