/**
 * `intention-lint` — the deterministic, day-one, gating form guard over the intention
 * corpus. Distinct from the advisory runtime `assert-fresh` (`./intention.js`): this
 * checks two things over the enumerated corpus — `subjects` frontmatter validity, and
 * `BACKLOG.md` SoT-pointer resolution.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseSubjects } from './intention-subjects.js';
import { matchGlob } from './glob.js';
import { containByRealpath } from './contain.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const SOT_BLOCK_MARKER = 'SoT';
const BACKTICK_PATTERN = /`([^`]+)`/g;

/**
 * Never-throw stat predicates mirroring manifest-lint-main's isRegularFile.
 * @param {string} p
 * @returns {boolean}
 */
function isRegularFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false; // equivalent mutant (empty catch): undefined is falsy — every caller only ever tests this via `!`/ternary truthiness, never `=== false`, so same observable effect
  }
}

function isDirectoryPath(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false; // equivalent mutant (empty catch): undefined is falsy — every caller only ever tests this via `!`/ternary truthiness, never `=== false`, so same observable effect
  }
}

/**
 * Collect the contiguous `>`-prefixed blockquote lines starting at the SoT pointer
 * paragraph (`> SoT — …`), joined back into one block.
 * @param {string} content
 * @returns {string}
 */
function findSotBlock(content) {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((line) => line.startsWith('>') && line.includes(SOT_BLOCK_MARKER));
  if (startIdx === -1) return ''; // equivalent mutant (StringLiteral, any non-backtick return value): this string's sole consumer is extractSotPointers' matchAll over BACKTICK_PATTERN — a value with no backtick character extracts the same empty pointer list as ''

  const blockLines = []; // equivalent mutant (ArrayDeclaration seeded with a sentinel): the sentinel has no backtick, and BACKTICK_PATTERN only extracts backtick-delimited substrings — a leading non-backtick element changes nothing extracted
  for (let i = startIdx; i < lines.length; i += 1) {
    if (!lines[i].startsWith('>')) break;
    blockLines.push(lines[i]);
  }
  // equivalent mutant (join('\n') → join('')): every collected line's backtick pair is opened and
  // closed within that same line (SoT pointer syntax never spans lines), so matchAll's pairing —
  // which depends only on backtick character order, not on the separator between lines — is
  // unaffected; the separator character never falls inside a captured group.
  return blockLines.join('\n');
}

/**
 * @param {string} content
 * @returns {string[]} the backtick-wrapped pointer strings on the SoT line(s)
 */
function extractSotPointers(content) {
  return [...findSotBlock(content).matchAll(BACKTICK_PATTERN)].map((m) => m[1]);
}

/**
 * @param {string} pattern - a glob SoT pointer (contains `*`)
 * @returns {string} the repo-relative directory to list, or '.' for a top-level glob
 */
function globBaseDir(pattern) {
  // equivalent mutant (MethodExpression: drop the .slice, keep the full pattern as prefix):
  // readdirSync below only ever lists ONE directory level, so globPointerResolves can only
  // resolve true when `*` sits in the pattern's terminal segment (no '/' after it) — and in
  // that shape, prefix.lastIndexOf('/') lands before the '*' either way, so the sliced and
  // full-pattern prefixes agree on every character up to that index. When `*` is followed by
  // a '/' (a shape this function can never resolve true for regardless), both branches
  // degrade to the same false result. Same observable outcome for every reachable input.
  const prefix = pattern.slice(0, pattern.indexOf('*'));
  const slashIdx = prefix.lastIndexOf('/');
  return slashIdx === -1 ? '.' : prefix.slice(0, slashIdx);
}

function joinRelative(dir, name) {
  return dir === '.' ? name : `${dir}/${name}`;
}

/**
 * Resolve a glob SoT pointer against a real, contained directory listing.
 * @param {string} root
 * @param {string} pattern
 * @returns {boolean} true when the glob matches >=1 real file
 */
function globPointerResolves(root, pattern) {
  const baseDir = globBaseDir(pattern);
  const contained = containByRealpath(root, resolve(root, baseDir));
  // equivalent mutant (false / && / first-operand-false, all three guard-elision mutations
  // Stryker tries here): whenever this guard would reject (contained === null, or contained
  // is a real path that isn't a directory), skipping the early return only defers the
  // rejection — readdirSync(contained) then throws (invalid arg on null, ENOTDIR on a file)
  // and the catch below returns false anyway. Same observable result for every input.
  if (contained === null || !isDirectoryPath(contained)) return false;

  let entries;
  try {
    entries = readdirSync(contained);
  } catch {
    return false;
  }
  return entries.some((entry) => matchGlob(joinRelative(baseDir, entry), pattern));
}

/**
 * Resolve one SoT pointer: a plain path exists as a file, a trailing-slash path
 * exists as a directory, a glob (contains `*`) matches >=1 real file. A containment
 * failure resolves to false — an error, never a silent skip.
 * @param {string} root
 * @param {string} pointer
 * @returns {boolean}
 */
function pointerResolves(root, pointer) {
  if (pointer.includes('*')) return globPointerResolves(root, pointer);

  const contained = containByRealpath(root, resolve(root, pointer));
  if (contained === null) return false; // equivalent mutant (remove null check): isDirectoryPath(null)/isRegularFile(null) → statSync(null) throws → caught → returns false; same result
  return pointer.endsWith('/') ? isDirectoryPath(contained) : isRegularFile(contained);
}

/**
 * Check 2 (SoT-pointer resolution): every backtick-wrapped pointer on BACKLOG.md's
 * SoT line(s) resolves to a real path, rooted at BACKLOG.md's own directory.
 * @param {string} backlogPath
 * @param {string} content
 * @param {string[]} errors
 */
function checkSotPointers(backlogPath, content, errors) {
  const root = dirname(resolve(backlogPath));
  for (const pointer of extractSotPointers(content)) {
    if (!pointerResolves(root, pointer)) {
      errors.push(`${backlogPath}: unresolvable SoT pointer: ${pointer}`);
    }
  }
}

/**
 * @param {unknown} value
 * @returns {boolean} true iff value is a non-empty list of non-empty strings
 */
function isNonEmptyStringList(value) {
  return Array.isArray(value) && value.length > 0 &&
    value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

/**
 * Check 1 (subjects validity): a present `subjects` must be a list of non-empty
 * strings; a mis-typed opened frontmatter block (parseSubjects throws) is a form
 * error. Absent frontmatter, or frontmatter without a `subjects` key, is never an
 * error — incremental adoption.
 * @param {string} pagePath
 * @param {string} content
 * @param {string[]} errors
 */
function checkSubjectsForm(pagePath, content, errors) {
  let subjects;
  try {
    subjects = parseSubjects(content);
  } catch (e) {
    errors.push(`${pagePath}: ${e.message}`);
    return;
  }
  if (subjects === null) return;
  if (!isNonEmptyStringList(subjects)) {
    errors.push(`${pagePath}: subjects must be a list of non-empty strings`);
  }
}

/**
 * Emit the standard INVALID-corpus diagnostic block to stderr.
 * @param {string[]} errors
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {number} EXIT_INVALID
 */
function failInvalid(errors, io) {
  io.stderr.write('craft-intention: INVALID corpus:\n');
  for (const err of errors) io.stderr.write(`- ${err}\n`);
  io.stderr.write('Fix the corpus — craft refuses to run on malformed intention metadata (fail loudly, never silently).\n');
  return EXIT_INVALID;
}

/**
 * Main entrypoint for intention-lint logic. `argv` is the enumerated living-corpus
 * file paths plus BACKLOG.md; classify each by basename.
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const errors = [];

  for (const filePath of argv) {
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch (e) {
      errors.push(`cannot read ${filePath}: ${e.message}`);
      continue;
    }

    if (basename(filePath) === 'BACKLOG.md') {
      checkSotPointers(filePath, content, errors);
    } else {
      checkSubjectsForm(filePath, content, errors);
    }
  }

  if (errors.length > 0) return failInvalid(errors, io);

  io.stdout.write(`craft-intention: OK — ${argv.length} path(s) valid.\n`);
  return EXIT_OK;
}
