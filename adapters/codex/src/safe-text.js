/**
 * Rendering of untrusted text for a line-oriented sink — a TOML basic string
 * or a terminal stream.
 *
 * Both sinks share one hazard: a character that renders as nothing, or that
 * rearranges what renders around it, decides how the rest of the value is read.
 * In TOML an unescaped control character is simply illegal; on a stream a `\r`
 * hides everything written before it, a `\n` forges a whole extra line under
 * this tool's own prefix, a zero-width character hides a difference between two
 * values that look identical, and a bidi override reverses the visible order of
 * the text around it. Since the echoed values are the human-visible safeguard —
 * what is being trusted is shown, not inferred — a value that can misrepresent
 * itself on the way to either sink reaches neither verbatim.
 */

// Control characters (U+0000-U+001F) plus DEL (U+007F): the two ranges TOML
// forbids unescaped inside a basic string.
const CONTROL_CHAR_UPPER_BOUND = 0x1f;
const DELETE_CHAR_CODE_POINT = 0x7f;
const ESCAPE_HEX_DIGITS = 4;

// Legal in a TOML basic string and harmless to a terminal's cursor, but not to
// a reader: zero-width and bidi-formatting characters change what the rendered
// text says without changing what it is. Ranges, not a set, because each is
// contiguous in Unicode and spelling out the members would invite gaps.
const INVISIBLE_CODE_POINT_RANGES = Object.freeze([
  Object.freeze([0x200b, 0x200f]),
  Object.freeze([0x202a, 0x202e]),
  Object.freeze([0x2066, 0x2069]),
]);

function isInvisibleCodePoint(codePoint) {
  return INVISIBLE_CODE_POINT_RANGES.some(([first, last]) => codePoint >= first && codePoint <= last);
}

function isControlCodePoint(codePoint) {
  return (
    codePoint <= CONTROL_CHAR_UPPER_BOUND ||
    codePoint === DELETE_CHAR_CODE_POINT ||
    isInvisibleCodePoint(codePoint)
  );
}

function toControlEscape(codePoint) {
  return `\\u${codePoint.toString(16).toUpperCase().padStart(ESCAPE_HEX_DIGITS, '0')}`;
}

/**
 * Replace every character that renders as nothing, or that rearranges what
 * renders around it, with its `\uXXXX` escape — leaving every character that
 * shows itself honestly as it stands.
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
