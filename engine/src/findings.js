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
 * may not contain a pipe). The delimiter itself is a single-character lookaround:
 * it matches the pipe alone, so it never retries a whitespace run from every position
 * inside it — the prior combined lazy-quantifier + optional-group pattern did, and
 * that is what produced its catastrophic backtracking on `<finding><spaces>|` input.
 * Because the lookaround doesn't consume the flanking whitespace, each split part
 * keeps it — `parseLine` trims both parts to restore the original delimiter's shape.
 */
const PIPE_DELIMITER = /(?<=\s)\|(?=\s)/u;
// equivalent mutant (Regex trailing `$` anchor dropped): `.*` is greedy and a single
// line never contains `\n`, so it already extends to the string's end on its own — an
// explicit end anchor changes nothing a caller can observe.
// equivalent mutant (Regex `\s+` narrowed to `\s` before the final capture): any extra
// whitespace the narrowed quantifier leaves uncaptured is absorbed into the greedy
// `(.*\S)` group as part of `finding`, which `toFinding` then trims — the parsed
// result is identical either way.
const LINE_HEAD_PATTERN = /^(\S+)\s+(\S+):(\d+)\s+[—–-]\s+(.*\S)$/u;

// Bounds how much of a per-line record the split path ever has to look at, even
// if the delimiter above ever regresses. Far above the largest record this
// module has ever seen in practice.
const MAX_LINE_CHARS = 16384;

/**
 * Optional leading status token on a per-line record, e.g. `VERIFIED: ...`.
 * Colon-anchored so a bare status-shaped word without the trailing colon
 * (or any other leading word) is left alone and parsed as `severity` instead.
 * A separate anchored pattern — not folded into LINE_HEAD_PATTERN — so it adds
 * no new backtracking shape to the line-head match.
 */
// equivalent mutant (Regex `\s+` narrowed to `\s`): any leftover leading whitespace the
// narrowed quantifier fails to consume sits at the front of `remainder`, which
// `parseLine`'s per-part `.trim()` strips unconditionally before matching — no caller
// can observe the difference.
const STATUS_PREFIX_PATTERN = /^(VERIFIED|SUSPECT|RULED-OUT|PROBE):\s+/u;

/**
 * One scope-spec entry: `<file>:<start>-<end>`. The head is greedy so the
 * LAST colon (not the first) separates the file path from the range —
 * tolerating colons inside the path itself.
 */
// equivalent mutant (Regex leading `^` anchor dropped): `parseScopeSpec` splits every
// spec on `\n` before an entry ever reaches this pattern, so no entry it sees can
// contain a newline for an unanchored `.+` to hide a prefix behind — the anchor is
// unreachable through this module's only caller.
const SCOPE_ENTRY_PATTERN = /^(.+):(\d+)-(\d+)$/u;
// The per-file scope form. The `:*` marker is REQUIRED: inferring a whole-file
// grant from a colon-free string turned a mistyped range into a silent widen,
// which is the mirror of the silent drop this module exists to prevent.
// equivalent mutant (Regex leading `^` anchor dropped): same reasoning as
// SCOPE_ENTRY_PATTERN above — no entry `parseScopeSpec` hands this pattern can ever
// contain a newline, so the anchor is unreachable through this module's only caller.
const WHOLE_FILE_ENTRY_PATTERN = /^(.+):\*$/u;

// Marks a file part that still carries another entry's range-or-star tail
// followed by a comma — exactly what the retired comma-joined form leaves
// behind once SCOPE_ENTRY_PATTERN's greedy head swallows it into one entry.
// A genuine path never legally contains this shape, so it is rejected rather
// than scoped to a file name nothing will ever match.
const SWALLOWED_ENTRY_PATTERN = /:(?:\d+-\d+|\*)\s*,/u;

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

  const parts = remainder.split(PIPE_DELIMITER).map(p => p.trim());
  // finding and fix can't span a second delimiter — more than one is unparseable.
  if (parts.length > 2) {
    return null;
  }
  const match = parts[0].match(LINE_HEAD_PATTERN);
  if (match === null) {
    return null;
  }
  const [, severity, file, rawLine, finding] = match;
  // equivalent mutant (Conditional `parts.length === 2` forced true): the
  // `parts.length > 2` guard above caps `parts.length` at 1 or 2, and `parts[1]` is
  // `undefined` for a length of 1 regardless of which branch of the ternary runs —
  // forcing the condition true yields the identical value.
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

  const results = [];
  for (const line of nonBlank) {
    // Truncate the echoed content — input may be long or carry sensitive text.
    const shown = line.length > 120 ? `${line.slice(0, 120)}…` : line;
    if (line.length > MAX_LINE_CHARS) {
      throw new Error(
        `Cannot parse findings: line exceeds the ${MAX_LINE_CHARS}-character cap`
        + ` (${line.length} characters): ${JSON.stringify(shown)}`,
      );
    }
    const finding = parseLine(line);
    if (finding === null) {
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
      if (SWALLOWED_ENTRY_PATTERN.test(wholeFile[1])) {
        throw new Error(`malformed scope entry: "${entry}"`);
      }
      // start 0, not 1: file-scoped findings are commonly reported at line 0,
      // and a whole-file grant that misses them is a silent drop.
      return { file: wholeFile[1].trim(), start: 0, end: Number.MAX_SAFE_INTEGER };
    }
    throw new Error(`malformed scope entry: "${entry}"`);
  }
  if (SWALLOWED_ENTRY_PATTERN.test(match[1])) {
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
 * Parses a single newline-joined scope spec into `ScopeRange[]`.
 * An empty spec is the honest "nothing changed" — it returns [].
 *
 * @param {string} spec
 * @returns {ScopeRange[]}
 */
export function parseScopeSpec(spec) {
  if (spec === '') {
    return [];
  }
  // A path may legally contain a comma but can never contain a newline, so
  // splitting on the newline removes the ambiguity at its root instead of
  // working around it. Each entry is still trimmed: a newline-joined spec
  // carries leading/trailing whitespace just as easily as a comma-joined one did.
  return spec.split('\n').map(entry => parseScopeEntry(entry.trim()));
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
