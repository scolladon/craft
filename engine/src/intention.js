/**
 * `file`-adapter read-side protocol core: `consult` + `assert-fresh`.
 * Pure — no I/O; all page reads are injected via `deps.readPage`/`deps.listCorpus`.
 * Engine-internal: invoked via the run/design/planning/validation skill prose (the
 * Claude binding), not by an in-process JS caller today — mirrors the `dod.js` /
 * `observability/memory.js` reference-impl precedent.
 */

import { matchGlob, globsOverlap } from './glob.js';
import { parseSubjects } from './intention-subjects.js';

/**
 * @typedef {{ path: string, purpose: string }} IntentionEntry
 * @typedef {{ page: string, reason: string }} SkippedPage
 * @typedef {{ entries: IntentionEntry[], skipped: SkippedPage[] }} IntentionView
 * @typedef {{ page: string, changedPaths: string[], waived: boolean }} StaleRow
 * @typedef {{ scope: string }} UncoveredScope
 * @typedef {{ schemaVersion: 1, stale: StaleRow[], uncovered: UncoveredScope[], skipped: SkippedPage[], note?: string }} FreshnessReport
 */

/**
 * Build the in-session intention view: living pages whose declared `subjects`
 * intersect the given scope.
 *
 * Never throws. An unreadable page is silently omitted (skip, not reject); a page
 * whose frontmatter carries no usable `subjects` (absent, malformed, or non-array)
 * is listed in `skipped`.
 *
 * @param {string[]} scope repo-relative paths (the change/phase touched set)
 * @param {{ readPage: (page: string) => string | null, listCorpus: () => string[] }} deps
 * @returns {IntentionView}
 */
export function consult(scope, deps) {
  const entries = [];
  const { subjectPages, skipped } = readSubjectPages(deps);

  for (const { page, content, subjects } of subjectPages) {
    if (matchingPaths(scope, subjects).length > 0) {
      entries.push({ path: page, purpose: extractPurpose(content) });
    }
  }

  return { entries: sortBy(entries, 'path'), skipped: sortBy(skipped, 'page') };
}

/**
 * The freshness/coverage guard. Never throws — an unresolvable diff is an
 * advisory no-op (an empty `changed` set yields no stale rows).
 *
 * @param {{ changed: string[], touched: string[], waived: string[], covers?: string[] }} change
 * @param {{ readPage: (page: string) => string | null, listCorpus: () => string[] }} deps
 * @returns {FreshnessReport}
 */
export function assertFresh(change, deps) {
  const changed = change.changed ?? [];
  const touched = change.touched ?? [];
  const waived = change.waived ?? [];
  const covers = change.covers ?? [];

  const stale = [];
  const { subjectPages, skipped } = readSubjectPages(deps);

  for (const { page, subjects } of subjectPages) {
    const staleRow = buildStaleRow(page, subjects, changed, touched, waived);
    if (staleRow) stale.push(staleRow);
  }

  const report = {
    schemaVersion: 1,
    stale: sortBy(stale, 'page'),
    uncovered: findUncovered(covers, subjectPages),
    skipped: sortBy(skipped, 'page'),
  };
  if (subjectPages.length === 0) report.note = 'no living pages carry subjects';
  return report;
}

/**
 * Classify a page's subjects. Malformed YAML (`parseSubjects` throws) or a non-null,
 * non-array value (wrong shape) is a `malformed-subjects` skip — a broken page must
 * read as broken, not as one that simply declared nothing. A `null` result (no
 * frontmatter, or a block without a `subjects` key) is genuine absence — `no-subjects`,
 * the incremental-adoption path.
 *
 * @param {string} content
 * @returns {{ subjects: string[] } | { reason: string }}
 */
function classifySubjects(content) {
  let subjects;
  try {
    subjects = parseSubjects(content);
  } catch {
    // equivalent mutant (BlockStatement empties this catch body): subjects stays
    // undefined on a throw, so execution falls through to `!Array.isArray(subjects)`
    // below (true for undefined) → same { reason: 'malformed-subjects' } result either way.
    return { reason: 'malformed-subjects' };
  }
  if (subjects === null) return { reason: 'no-subjects' };
  if (!Array.isArray(subjects) || !subjects.every(isNonEmptyString)) {
    return { reason: 'malformed-subjects' };
  }
  return { subjects };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Read the corpus once, classifying each page's subjects. Shared by `consult` and
 * `assertFresh` — both verbs read pages and skip unusable ones identically, diverging
 * only in what they do with a valid subject-page.
 *
 * @param {{ readPage: (page: string) => string | null, listCorpus: () => string[] }} deps
 * @returns {{ subjectPages: { page: string, content: string, subjects: string[] }[], skipped: SkippedPage[] }}
 */
function readSubjectPages(deps) {
  const subjectPages = [];
  const skipped = [];
  for (const page of deps.listCorpus()) {
    const content = deps.readPage(page);
    if (content === null) continue;

    const classified = classifySubjects(content);
    if (classified.reason) {
      skipped.push({ page, reason: classified.reason });
      continue;
    }
    subjectPages.push({ page, content, subjects: classified.subjects });
  }
  return { subjectPages, skipped };
}

/**
 * The subset of `paths` matched by at least one of `globs` — shared by `consult`'s
 * scope check, `assertFresh`'s stale check, and its coverage check.
 *
 * @param {string[]} paths
 * @param {string[]} globs
 * @returns {string[]}
 */
function matchingPaths(paths, globs) {
  return paths.filter(path => globs.some(glob => matchGlob(path, glob)));
}

/**
 * Build a stale row for one page, or null when it is not a stale candidate.
 * A candidate (subject changed, page untouched) always yields a row; `waived`
 * flags whether the caller should still emit a drift line for it.
 *
 * @param {string} page
 * @param {string[]} subjects
 * @param {string[]} changed
 * @param {string[]} touched
 * @param {string[]} waived
 * @returns {StaleRow | null}
 */
function buildStaleRow(page, subjects, changed, touched, waived) {
  const changedPaths = matchingPaths(changed, subjects);
  if (changedPaths.length === 0 || touched.includes(page)) return null;
  return { page, changedPaths: [...changedPaths].sort(), waived: waived.includes(page) };
}

/**
 * Coverage scopes overlapping no page's declared subjects. A `covers` scope is itself
 * a glob, so overlap — not concrete-path matching — is the right test: see
 * `globsOverlap`.
 * @param {string[]} covers
 * @param {{ page: string, subjects: string[] }[]} subjectPages
 * @returns {UncoveredScope[]}
 */
function findUncovered(covers, subjectPages) {
  const uncovered = covers
    .filter(scope => !subjectPages.some(({ subjects }) => subjects.some(subject => globsOverlap(scope, subject))))
    .map(scope => ({ scope }));
  return sortBy(uncovered, 'scope');
}

/**
 * A page's H1 / first non-empty summary line, skipping any frontmatter fence.
 * @param {string} content
 * @returns {string}
 */
function extractPurpose(content) {
  for (const rawLine of stripFrontmatter(content).split('\n')) {
    const line = rawLine.trim();
    if (line !== '') return line.replace(/^#+\s*/, '');
  }
  return '';
}

/**
 * Strip a line-1 `---`-fenced frontmatter block, if present.
 * @param {string} content
 * @returns {string}
 */
function stripFrontmatter(content) {
  const lines = content.split('\n');
  // equivalent mutant (ConditionalExpression -> false, and MethodExpression dropping
  // .trim()): stripFrontmatter is only reached via extractPurpose on content already
  // classified with valid subjects, which requires parseSubjects/extractFrontmatter to
  // have matched lines[0] === '---' (the identical fence check, already whitespace-free).
  // The early-return is therefore always false here, and .trim() is a no-op on an
  // already-exact '---' — this guard and the trim are both dead/no-op for any consult input.
  if ((lines[0] ?? '').trim() !== '---') return content;

  const closeIdx = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (closeIdx === -1) return '';
  return lines.slice(closeIdx + 1).join('\n');
}

/**
 * Sort an array of objects by a string key (stable serialization).
 * @param {object[]} items
 * @param {string} key
 * @returns {object[]}
 */
function sortBy(items, key) {
  return [...items].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
}
