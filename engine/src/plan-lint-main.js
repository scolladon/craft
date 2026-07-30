/**
 * `plan-lint` — validates a craft plan file against the part schema
 * (`templates/plan.md`): every `## Part` heading must carry its four
 * pre-chewed sections (`### Context`, `### TDD steps`, `### Gate`,
 * `### Commit`), and warns (advisory, never blocking) when two or more
 * parts' `### Context` blocks declare the same repo file.
 *
 * Moved from `scripts/plan-lint.sh` (awk) to this house bin-shim-over-pure-src
 * archetype so the new cross-part overlap detector — set intersection, awk-hostile —
 * lands on a testable, gated surface. It keeps the awk script's `^## Part`
 * prefix-match quirk, and deliberately diverges from it twice:
 *
 * 1. `### ` sections appearing before the first part heading no longer satisfy the
 *    first part. The awk `flush()` returned early on an empty part without clearing
 *    `seen[]`, so preamble headings leaked into the first part and a bare opening
 *    part passed. This is a gate flipping 0 → 2 on such a plan. No plan's verdict
 *    changes today: two committed plans do carry preamble `### ` headings, but
 *    none of them use the four required names.
 * 2. A missing argv[0] is a clean usage error (exit 2), not a bash `${1:?…}` exit 1.
 */

import { readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { containByRealpath } from './contain.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const REQUIRED = ['### Context', '### TDD steps', '### Gate', '### Commit'];
const PART_HEADING_PREFIX = '## Part';
const CONTEXT_HEADING_PREFIX = '### Context';
const BLOCK_BOUNDARY = /^(### |## )/;
const BACKTICK_PATTERN = /`([^`]+)`/g;
const PART_LABEL_PATTERN = /^## Part\s+(\S+)/; // equivalent mutant (leading `^` removed): every heading `.match()`'d here already starts with the literal "## Part" (collectParts only builds a Part from a line satisfying `startsWith(PART_HEADING_PREFIX)`), so `.match()` finds the same match at position 0 whether or not the pattern is anchored
// Above this many parts, a shared path is repo infrastructure (a CI script, an
// index, a config) rather than a shared unit of work, so "merge the parts" stops
// being an available action. The signal is still reported — only the suggested
// remedy changes, because the widest overlaps are the ones worth seeing.
const MERGEABLE_PART_LIMIT = 3;

/**
 * Regular-file predicate mirroring the bash `[ -f <path> ]` test.
 * @param {string} p
 * @returns {boolean}
 */
function isRegularFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false; // equivalent mutant (empty catch): undefined is falsy — the caller only ever tests this via `!`, same observable effect
  }
}

/**
 * @typedef {{ heading: string, label: string, startIdx: number, endIdx: number }} Part
 */

/**
 * Split the plan's lines into parts at each `^## Part`-prefixed heading
 * (prefix match, deliberately — the awk script's quirk that a heading such
 * as "## Partition …" is also treated as a part).
 * @param {string[]} lines
 * @returns {Part[]}
 */
function collectParts(lines) {
  const startIdxs = [];
  lines.forEach((line, i) => {
    if (line.startsWith(PART_HEADING_PREFIX)) startIdxs.push(i);
  });
  return startIdxs.map((startIdx, k) => {
    const endIdx = k + 1 < startIdxs.length ? startIdxs[k + 1] : lines.length;
    return { heading: lines[startIdx], label: partLabel(lines[startIdx]), startIdx, endIdx };
  });
}

/**
 * `Part <token>` from `^## Part\s+(\S+)`; falls back to the heading text with
 * the leading `## ` stripped when the heading does not match that shape.
 * @param {string} heading
 * @returns {string}
 */
function partLabel(heading) {
  const m = heading.match(PART_LABEL_PATTERN);
  return m ? `Part ${m[1]}` : heading.replace(/^## /, ''); // equivalent mutant (leading `^` removed from the replace pattern): `.replace()` without the global flag always resolves to the first match, and this fallback only ever runs on a heading that already starts with "## " literally — anchored or not, the match is found at position 0
}

/**
 * Which of REQUIRED are present in a part's own line range, in REQUIRED order.
 * @param {string[]} lines
 * @param {Part} part
 * @returns {string[]} missing section names, REQUIRED order
 */
function missingSections(lines, part) {
  const seen = new Set();
  for (let i = part.startIdx; i < part.endIdx; i += 1) {
    const line = lines[i];
    if (!line.startsWith('### ')) continue; // equivalent mutant (guard forced false / startsWith('') always-true): every REQUIRED entry itself starts with "### ", so `line.startsWith(req)` below can only ever match a line that also starts with "### " — this early skip changes no line's fate, only how many lines you compare `req` against
    for (const req of REQUIRED) {
      if (line.startsWith(req)) seen.add(req);
    }
  }
  return REQUIRED.filter((req) => !seen.has(req));
}

/**
 * A part's `### Context` block: from its `### Context` heading to the next
 * line matching `^### ` or `^## ` (or the part's own end). Absent when the
 * part carries no `### Context` heading.
 * @param {string[]} lines
 * @param {Part} part
 * @returns {string|null}
 */
function contextBlock(lines, part) {
  let contextIdx = -1;
  for (let i = part.startIdx; i < part.endIdx; i += 1) {
    if (lines[i].startsWith(CONTEXT_HEADING_PREFIX)) {
      contextIdx = i;
      break;
    }
  }
  if (contextIdx === -1) return null; // equivalent mutant (forced false): the disabled guard falls through to `lines.slice(-1, blockEnd)`; a negative start normalizes to `lines.length - 1`, and blockEnd is always well before the file's last line for any part followed by more content, so the slice is empty either way — same observable "nothing declared" result

  let blockEnd = part.endIdx;
  for (let i = contextIdx + 1; i < part.endIdx; i += 1) { // equivalent mutant (`i < part.endIdx` → `i <= part.endIdx`): the one extra index checked is `lines[part.endIdx]`, which is either out of bounds (last part) or the START of the NEXT part's own heading (`collectParts` defines `endIdx` as exactly that index) — a line that always matches BLOCK_BOUNDARY, setting `blockEnd` to the same value it already defaults to
    if (BLOCK_BOUNDARY.test(lines[i])) {
      blockEnd = i;
      break;
    }
  }
  return lines.slice(contextIdx, blockEnd).join('\n');
}

/**
 * Walk up from the plan file's directory to the first ancestor containing a
 * `.git` entry (file or directory — a worktree's `.git` is a file), falling
 * back to the plan file's own directory when none is found.
 * @param {string} planPath
 * @returns {string}
 */
function findRepoRoot(planPath) {
  const startDir = dirname(resolve(planPath));
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

/**
 * Resolve a backticked span to a repo-relative file path, or null when the
 * span is a directory span, escapes the root, or resolves to nothing —
 * an under-report is the deliberately safe failure mode for an advisory check.
 * @param {string} repoRoot
 * @param {string} span
 * @returns {string|null}
 */
function resolveDeclaredFile(repoRoot, span) {
  // equivalent mutants on this guard (whole condition forced false, `||` → `&&`,
  // or just the `span === ''` half dropped): `span` is always `match[1]` of
  // BACKTICK_PATTERN's `` `([^`]+)` `` (a `+` quantifier — never empty), and the
  // one other caller passes `resolve(planPath)` (never empty either), so
  // `span === ''` is dead on arrival. A disabled `span.endsWith('/')` check is
  // redundant too: a real directory still fails `stat.isFile()` below, and a
  // nonexistent one still throws into the catch — every route lands on `null`.
  if (span === '' || span.endsWith('/')) return null;

  const contained = containByRealpath(repoRoot, resolve(repoRoot, span));
  if (contained === null) return null; // equivalent mutant (forced false): a disabled guard passes `null` into `statSync(null)`, which throws (not a valid path) — caught immediately below, same `null` result

  let stat;
  try {
    stat = statSync(contained);
  } catch {
    return null; // resolves to nothing → not a declared file
  }
  if (!stat.isFile()) return null; // directory span → not a declared file

  return relative(repoRoot, contained);
}

/**
 * The set of repo-relative file paths a part's `### Context` block declares
 * via backticked spans.
 * @param {string[]} lines
 * @param {Part} part
 * @param {string} repoRoot
 * @param {Map<string, string|null>} cache — span → resolution, shared across parts
 * @returns {Set<string>}
 */
function declaredFiles(lines, part, repoRoot, cache) {
  const block = contextBlock(lines, part);
  const declared = new Set();
  if (block === null) return declared;

  for (const match of block.matchAll(BACKTICK_PATTERN)) {
    const span = match[1];
    // Spans repeat within and across parts, and each miss costs a stat chain.
    if (!cache.has(span)) cache.set(span, resolveDeclaredFile(repoRoot, span)); // equivalent mutant (forced true): resolveDeclaredFile is pure over (repoRoot, span) with no side effects between calls in one invocation, so recomputing and overwriting an already-cached entry yields the identical value — a performance-only guard
    const resolved = cache.get(span);
    if (resolved !== null) declared.add(resolved);
  }
  return declared;
}

/**
 * One advisory warning line per file path declared by two or more parts,
 * sorted lexicographically by path for determinism. The plan's own path is
 * excluded: parts citing it are recording provenance, not sharing a unit of work.
 * @param {string[]} lines
 * @param {Part[]} parts
 * @param {string} repoRoot
 * @param {string|null} selfPath — the plan's own repo-relative path
 * @returns {string[]}
 */
function overlapWarnings(lines, parts, repoRoot, selfPath) {
  const pathToLabels = new Map();
  const spanCache = new Map();
  for (const part of parts) {
    for (const path of declaredFiles(lines, part, repoRoot, spanCache)) {
      if (!pathToLabels.has(path)) pathToLabels.set(path, []);
      pathToLabels.get(path).push(part.label);
    }
  }

  return [...pathToLabels.entries()]
    .filter(([path]) => path !== selfPath)
    .filter(([, labels]) => labels.length >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, labels]) => (labels.length <= MERGEABLE_PART_LIMIT
      ? `plan-lint: cognitive-locality warning — \`${path}\` declared in ${labels.join(', ')}. Merge the parts or state why they are separate.`
      : `plan-lint: cognitive-locality warning — \`${path}\` declared in ${labels.length} parts — shared infrastructure; confirm this is intentional.`),
    );
}

/**
 * Main entrypoint for plan-lint logic. Carries the schema check, the advisory
 * cross-part overlap warning, and the two deliberate divergences from the
 * retired awk script documented in the module header above.
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const planPath = argv[0];
  if (!planPath) {
    io.stderr.write('plan-lint: usage: plan-lint <plan-file>\n');
    return EXIT_INVALID;
  }
  if (!isRegularFile(planPath)) {
    io.stderr.write(`plan-lint: no such file: ${planPath}\n`);
    return EXIT_INVALID;
  }

  const content = readFileSync(planPath, 'utf8');
  const lines = content.split('\n');
  const parts = collectParts(lines);

  if (parts.length === 0) {
    io.stdout.write('plan-lint: no "## Part" sections found — not a craft plan.\n');
    return EXIT_INVALID;
  }

  let bad = 0;
  for (const part of parts) {
    const missing = missingSections(lines, part);
    if (missing.length > 0) {
      io.stdout.write(`plan-lint: part "${part.heading}" missing: ${missing.join(', ')}\n`);
      bad += 1;
    }
  }

  const repoRoot = findRepoRoot(planPath);
  const selfPath = resolveDeclaredFile(repoRoot, resolve(planPath));
  for (const warning of overlapWarnings(lines, parts, repoRoot, selfPath)) {
    io.stdout.write(`${warning}\n`);
  }

  if (bad > 0) {
    io.stdout.write(`plan-lint: ${bad} part(s) violate the schema. The plan phase cannot close.\n`);
    return EXIT_INVALID;
  }

  io.stdout.write(`plan-lint: ${parts.length} part(s) OK — every part carries its context block.\n`);
  return EXIT_OK;
}
