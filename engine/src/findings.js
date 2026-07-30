/**
 * @typedef {{ file: string, line: number, severity: string, finding: string, fix?: string, status?: string }} Finding
 */

/**
 * @typedef {{ file: string, start: number, end: number }} ScopeRange
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

/**
 * Optional leading status token on a per-line record, e.g. `VERIFIED: ...`.
 * Colon-anchored so a bare status-shaped word without the trailing colon
 * (or any other leading word) is left alone and parsed as `severity` instead.
 * A separate anchored pattern — not folded into LINE_HEAD_PATTERN — so it adds
 * no new backtracking shape to the line-head match.
 */
const STATUS_PREFIX_PATTERN = /^(VERIFIED|SUSPECT|RULED-OUT|PROBE):\s+/u;

/**
 * One scope-spec entry: `<file>:<start>-<end>`. The head is greedy so the
 * LAST colon (not the first) separates the file path from the range —
 * tolerating colons inside the path itself.
 */
const SCOPE_ENTRY_PATTERN = /^(.+):(\d+)-(\d+)$/u;
// The per-file scope form. The `:*` marker is REQUIRED: inferring a whole-file
// grant from a colon-free string turned a mistyped range into a silent widen,
// which is the mirror of the silent drop this module exists to prevent.
const WHOLE_FILE_ENTRY_PATTERN = /^(.+):\*$/u;

const REQUIRED_JSON_FIELDS = /** @type {const} */ (['file', 'line', 'severity', 'finding']);

/**
 * Build a canonical Finding from raw field values, regardless of source shape.
 * `fix` and `status` are omitted when null or undefined.
 *
 * @param {{ file: unknown, line: unknown, severity: unknown, finding: unknown, fix?: unknown, status?: unknown }} fields
 * @returns {Finding}
 */
function toFinding({ file, line, severity, finding, fix, status }) {
  const base = {
    file: String(file),
    line: Number(line),
    severity: String(severity),
    finding: String(finding).trim(),
  };
  const withFix = fix != null ? { ...base, fix: String(fix).trim() } : base;
  // status mirrors severity: passed through unvalidated and un-trimmed — it is
  // free-form deliberation vocabulary, not a structural field to normalize.
  return status != null ? { ...withFix, status: String(status) } : withFix;
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
  const trimmed = line.trim();
  const statusMatch = trimmed.match(STATUS_PREFIX_PATTERN);
  const status = statusMatch ? statusMatch[1] : undefined;
  const remainder = statusMatch ? trimmed.slice(statusMatch[0].length) : trimmed;

  const parts = remainder.split(PIPE_DELIMITER);
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
  return toFinding({ file, line: rawLine, severity, finding, fix, status });
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

/**
 * Parses a single scope-spec entry. `<file>:<start>-<end>` bounds a hunk;
 * `<file>:*` covers the whole file, which is the per-file scope form. Throws on
 * any other shape, or a range where `start < 1` or `end < start` — never a
 * silent drop, and never a silent widen.
 *
 * @param {string} entry
 * @returns {ScopeRange}
 */
function parseScopeEntry(entry) {
  const match = entry.match(SCOPE_ENTRY_PATTERN);
  if (match === null) {
    const wholeFile = entry.match(WHOLE_FILE_ENTRY_PATTERN);
    if (wholeFile !== null) {
      // start 0, not 1: file-scoped findings are commonly reported at line 0,
      // and a whole-file grant that misses them is a silent drop.
      return { file: wholeFile[1].trim(), start: 0, end: Number.MAX_SAFE_INTEGER };
    }
    throw new Error(`malformed scope entry: "${entry}"`);
  }
  const start = Number(match[2]);
  const end = Number(match[3]);
  if (!(start >= 1 && end >= start)) {
    throw new Error(`malformed scope entry: "${entry}"`);
  }
  return { file: match[1].trim(), start, end };
}

/**
 * Parses a single comma-joined scope spec into `ScopeRange[]`.
 * An empty spec is the honest "nothing changed" — it returns [].
 *
 * @param {string} spec
 * @returns {ScopeRange[]}
 */
export function parseScopeSpec(spec) {
  if (spec === '') {
    return [];
  }
  // A spec is hand-authored as often as generated, so "a.js:1-9, b.js:1-9" is a
  // likely form. Untrimmed, the space joins the filename and every finding for
  // that file drops silently.
  return spec.split(',').map(entry => parseScopeEntry(entry.trim()));
}

/**
 * Reduces a path to the repo-relative form the scope spec is built in. A
 * technique may emit an absolute path or a `./` prefix for the same file the
 * spec names bare; without this the two sides never compare equal and every
 * finding for that file drops silently.
 *
 * @param {string} file
 * @param {string} repoRoot — absolute root, or '' to skip relativization
 * @returns {string}
 */
function canonicalPath(file, repoRoot) {
  if (typeof file !== 'string') {
    return file;
  }
  const prefix = repoRoot.endsWith('/') ? repoRoot : `${repoRoot}/`;
  const rooted = repoRoot !== '' && file.startsWith(prefix) ? file.slice(prefix.length) : file;
  return rooted.startsWith('./') ? rooted.slice(2) : rooted;
}

/**
 * Keeps a finding when some range covers its file and line (inclusive on
 * both ends). Order-preserving; a finding matching no range is dropped.
 *
 * @param {Finding[]} findings
 * @param {ScopeRange[]} ranges
 * @param {string} [repoRoot] — absolute root, used to relativize absolute finding paths
 * @returns {Finding[]}
 */
export function filterFindings(findings, ranges, repoRoot = '') { // equivalent mutant (StringLiteral default '' → sentinel): the default is only ever consumed via `repoRoot !== '' && file.startsWith(\`${repoRoot}/\`)` — any sentinel value a real finding path will never start with is observably identical to ''
  const canonicalRanges = ranges.map(range => ({
    ...range,
    file: canonicalPath(range.file, repoRoot),
  }));
  return findings.filter((finding) => {
    const file = canonicalPath(finding.file, repoRoot);
    return canonicalRanges.some(range =>
      range.file === file && range.start <= finding.line && finding.line <= range.end,
    );
  });
}
