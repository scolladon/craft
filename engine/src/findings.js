/**
 * @typedef {{ file: string, line: number, severity: string, finding: string, fix?: string }} Finding
 */

/**
 * Per-line shape: <severity> <file>:<line> — <finding> [ | <fix> ]
 * The em-dash separator (—) may be surrounded by any whitespace; the ` | ` fix part
 * is optional. We split on the pipe delimiter FIRST, then match the head with a single
 * backtracking-free pattern — preserving the original `[^|]` semantics (finding and fix
 * may not contain a pipe) without the catastrophic backtracking the prior combined
 * lazy-quantifier + optional-group pattern exhibited on `<finding><spaces>|` input.
 */
const PIPE_DELIMITER = /\s+\|\s+/u;
const LINE_HEAD_PATTERN = /^(\S+)\s+(\S+):(\d+)\s+[—–-]\s+(.*\S)$/u;

const REQUIRED_JSON_FIELDS = /** @type {const} */ (['file', 'line', 'severity', 'finding']);

/**
 * Build a canonical Finding from raw field values, regardless of source shape.
 * `fix` is omitted when null or undefined (it is the only optional field).
 *
 * @param {{ file: unknown, line: unknown, severity: unknown, finding: unknown, fix?: unknown }} fields
 * @returns {Finding}
 */
function toFinding({ file, line, severity, finding, fix }) {
  const base = {
    file: String(file),
    line: Number(line),
    severity: String(severity),
    finding: String(finding).trim(),
  };
  return fix != null ? { ...base, fix: String(fix).trim() } : base;
}

/**
 * Returns true when `raw` starts with a JSON array token (cheap shape sniff).
 *
 * @param {string} trimmed
 * @returns {boolean}
 */
function looksLikeJsonArray(trimmed) {
  return trimmed.startsWith('[');
}

/**
 * Maps a raw JSON object to a canonical Finding, validating required fields.
 *
 * @param {unknown} item
 * @param {number} index
 * @returns {Finding}
 */
function mapJsonItem(item, index) {
  if (item == null || typeof item !== 'object') {
    throw new Error(`Finding at index ${index} is not an object`);
  }
  for (const field of REQUIRED_JSON_FIELDS) {
    if (!(field in item)) {
      throw new Error(`Finding at index ${index} missing required field: ${field}`);
    }
  }
  return toFinding(/** @type {Record<string,unknown>} */ (item));
}

/**
 * Parses raw input as a JSON array of Finding objects.
 *
 * @param {string} raw
 * @returns {Finding[]}
 */
function parseJsonShape(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Cannot parse findings: invalid JSON — ${err.message}`, { cause: err });
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Cannot parse findings: JSON input must be an array');
  }
  return parsed.map(mapJsonItem);
}

/**
 * Parses a single non-empty line into a Finding.
 * Returns null when the line matches nothing (blank lines are filtered before this).
 *
 * @param {string} line
 * @returns {Finding | null}
 */
function parseLine(line) {
  const parts = line.trim().split(PIPE_DELIMITER);
  // finding and fix can't span a second delimiter — more than one is unparseable.
  if (parts.length > 2) {
    return null;
  }
  const match = parts[0].match(LINE_HEAD_PATTERN);
  if (match === null) {
    return null;
  }
  const [, severity, file, rawLine, finding] = match;
  const fix = parts.length === 2 ? parts[1] : undefined;
  // A bare pipe in finding or fix is rejected (the original `[^|]` groups did the same).
  if (finding.includes('|') || (fix !== undefined && fix.includes('|'))) {
    return null;
  }
  return toFinding({ file, line: rawLine, severity, finding, fix });
}

/**
 * Parses raw input as a sequence of per-line finding records.
 * Every non-blank line must parse; any line that fails makes the whole input
 * structurally unrecoverable (throws rather than silently dropping a finding).
 *
 * @param {string} raw
 * @returns {Finding[]}
 */
function parseLineShape(raw) {
  const nonBlank = raw.split('\n').filter(l => l.trim() !== '');
  if (nonBlank.length === 0) {
    return [];
  }

  const results = [];
  for (const line of nonBlank) {
    const finding = parseLine(line);
    if (finding === null) {
      // Truncate the echoed content — input may be long or carry sensitive text.
      const shown = line.length > 120 ? `${line.slice(0, 120)}…` : line;
      throw new Error(
        `Cannot parse findings: line does not match the per-line format: ${JSON.stringify(shown)}`,
      );
    }
    results.push(finding);
  }
  return results;
}

/**
 * Normalises raw role output into a canonical Finding[].
 *
 * Accepts two shapes interchangeably (R10 — key on fields, never on layout):
 *   - A JSON array of `{ file, line, severity, finding, fix? }` objects.
 *   - A per-line list where each line is:
 *       `<severity> <file>:<line> — <finding> [ | <fix> ]`
 *
 * `fix` is optional in both shapes.
 * Zero findings → [].
 * Throws only on structurally unrecoverable input.
 *
 * @param {string} raw
 * @returns {Finding[]}
 */
export function normalizeFindings(raw) {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return [];
  }

  if (looksLikeJsonArray(trimmed)) {
    return parseJsonShape(trimmed);
  }

  return parseLineShape(trimmed);
}
