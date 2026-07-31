/**
 * Targeted upsert of the hook-trust hash into codex's `config.toml`, without
 * a TOML parser: the file is the operator's own, and parsing then rewriting
 * the whole document would touch lines this change has no business touching.
 * This only ever locates one `[hooks.state.<key>]` table by exact header
 * match and edits its `trusted_hash` assignment, leaving every other byte in
 * the file untouched.
 */

const TABLE_HEADER_PREFIX = '[hooks.state.';
const TABLE_HEADER_SUFFIX = ']';
const TABLE_BOUNDARY_CHAR = '[';
const TRUSTED_HASH_KEY = 'trusted_hash';
const TRUSTED_HASH_ASSIGNMENT_PATTERN = /^\s*trusted_hash\s*=/;

// Control characters (U+0000-U+001F) plus DEL (U+007F): the two ranges TOML
// forbids unescaped inside a basic string.
const CONTROL_CHAR_UPPER_BOUND = 0x1f;
const DELETE_CHAR_CODE_POINT = 0x7f;

function isControlCodePoint(codePoint) {
  return codePoint <= CONTROL_CHAR_UPPER_BOUND || codePoint === DELETE_CHAR_CODE_POINT;
}

function toControlEscape(codePoint) {
  return `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

function escapeControlChars(text) {
  return Array.from(text)
    .map((char) => {
      const codePoint = char.codePointAt(0);
      return isControlCodePoint(codePoint) ? toControlEscape(codePoint) : char;
    })
    .join('');
}

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
 * A table's extent runs from the line after its header to the next
 * line-initial `[`, or end of text. Shared by both the replace and the
 * insert routes so the boundary rule exists in exactly one place.
 */
function findTableExtent(lines, headerIndex) {
  const start = headerIndex + 1;
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].startsWith(TABLE_BOUNDARY_CHAR)) {
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

function replaceOrInsertAssignment(lines, headerIndex, hash) {
  const extent = findTableExtent(lines, headerIndex);
  const indices = findTrustedHashIndices(lines, extent);

  if (indices.length > 1) {
    // A duplicate key is already invalid TOML; guessing which occurrence to
    // replace would silently paper over a config the operator needs to fix.
    throw new Error(
      `upsertTrustedHash: table already carries ${indices.length} trusted_hash assignments, refusing to guess which one to replace`
    );
  }

  const assignmentLine = buildAssignmentLine(hash);
  const nextLines = [...lines];
  if (indices.length === 1) {
    nextLines[indices[0]] = assignmentLine;
  } else {
    nextLines.splice(extent.start, 0, assignmentLine);
  }
  return nextLines.join('\n');
}

function appendTable(tomlText, headerLine, hash) {
  const block = `${headerLine}\n${buildAssignmentLine(hash)}\n`;
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
  const lines = tomlText.split('\n');
  const headerIndex = lines.findIndex((line) => line.trim() === headerLine);

  if (headerIndex === -1) {
    return appendTable(tomlText, headerLine, hash);
  }
  return replaceOrInsertAssignment(lines, headerIndex, hash);
}
