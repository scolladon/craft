/**
 * Rendering of untrusted text for a line-oriented sink — a TOML basic string
 * or a terminal stream.
 *
 * Both sinks share one hazard: a control character in a value decides how the
 * bytes around it are read. In TOML an unescaped one is simply illegal; on a
 * stream a `\r` hides everything written before it and a `\n` forges a whole
 * extra line under this tool's own prefix. Since the echoed values are the
 * human-visible safeguard — what is being trusted is shown, not inferred —
 * neither sink may receive a control character verbatim.
 */

// Control characters (U+0000-U+001F) plus DEL (U+007F): the two ranges TOML
// forbids unescaped inside a basic string.
const CONTROL_CHAR_UPPER_BOUND = 0x1f;
const DELETE_CHAR_CODE_POINT = 0x7f;
const ESCAPE_HEX_DIGITS = 4;

function isControlCodePoint(codePoint) {
  return codePoint <= CONTROL_CHAR_UPPER_BOUND || codePoint === DELETE_CHAR_CODE_POINT;
}

function toControlEscape(codePoint) {
  return `\\u${codePoint.toString(16).toUpperCase().padStart(ESCAPE_HEX_DIGITS, '0')}`;
}

/**
 * Replace every control character with its `\uXXXX` escape, leaving every
 * other character as it stands.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeControlChars(text) {
  return Array.from(text)
    .map((char) => {
      const codePoint = char.codePointAt(0);
      return isControlCodePoint(codePoint) ? toControlEscape(codePoint) : char;
    })
    .join('');
}

/**
 * Render an arbitrary value as one line of display text. Nothing validates the
 * shape of what the server sends, so a non-string is coerced rather than left
 * to reach a stream as-is.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function toDisplayText(value) {
  return escapeControlChars(String(value));
}
