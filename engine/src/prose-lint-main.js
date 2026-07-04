/**
 * `prose-lint` — deterministic gate over touched docs and the PR body: greps
 * a curated filler-phrase list and reports `SLOP-FOUND` lines. Same
 * bin+src shape as the other engine gates (`../bin/prose-lint.js` → this
 * module's `main(argv, io)`).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXIT_OK = 0;
const EXIT_FOUND = 2;

const BAN_LIST = Object.freeze([
  'delve',
  'leverage',
  'seamless',
  'robust',
  "it's important to note",
  'in conclusion',
]);
const SELF = fileURLToPath(import.meta.url);
const WAIVER_PATTERN = /SLOP-WAIVE\(([^)]+)\)/g;

/**
 * @param {string[]} argv
 * @returns {{ gate: string, waiverSources: string[], files: string[] }}
 */
function parseArgs(argv) {
  const waiverSources = [];
  const files = [];
  let gate = 'advisory'; // equivalent mutant (StringLiteral default, e.g. ''): gate is only ever compared via `=== 'blocking'`, so any non-'blocking' default is observably identical
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--gate') {
      gate = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--waiver-source') {
      waiverSources.push(argv[i + 1]);
      i += 1;
    } else {
      files.push(argv[i]);
    }
  }
  return { gate, waiverSources, files };
}

/**
 * Collect waived file paths from `--waiver-source` files. An unreadable
 * source is a loud stderr line, handled (never swallowed), then skipped.
 * @param {string[]} waiverSources
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {Set<string>}
 */
function collectWaived(waiverSources, io) {
  const waived = new Set();
  for (const source of waiverSources) {
    let content;
    try {
      content = readFileSync(source, 'utf8');
    } catch (e) {
      io.stderr.write(`cannot read waiver source ${source}: ${e.message}\n`);
      continue;
    }
    for (const match of content.matchAll(WAIVER_PATTERN)) waived.add(match[1].trim());
  }
  return waived;
}

/**
 * A single-token entry matches only on its own word boundaries, so it never
 * matches as a substring of a longer word. A multi-word entry matches as a
 * plain case-insensitive substring instead, so punctuation inside the entry
 * (e.g. an apostrophe) is honored literally.
 * @param {string} content
 * @param {string} entry
 * @returns {boolean}
 */
function entryMatches(content, entry) {
  if (entry.includes(' ')) return content.toLowerCase().includes(entry.toLowerCase());
  return new RegExp(`\\b${entry}\\b`, 'i').test(content);
}

/**
 * @param {string} content
 * @returns {string[]} BAN_LIST entries matched in content, one per entry
 */
function findEntries(content) {
  return BAN_LIST.filter((entry) => entryMatches(content, entry));
}

/**
 * @param {string} filePath
 * @returns {boolean} true when filePath resolves to this module's own source
 */
function isSelf(filePath) {
  return resolve(process.cwd(), filePath) === SELF;
}

/**
 * Scan one file, printing findings to stdout and read errors to stderr.
 * @param {string} file
 * @param {Set<string>} waived
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {{ found: boolean, readError: boolean }}
 */
function scanFile(file, waived, io) {
  // equivalent mutant (ObjectLiteral: return {} instead of { found: false, readError: false }):
  // the destructured found/readError are then undefined, and `hasFindings = hasFindings || found`
  // keeps hasFindings false either way (undefined is as falsy as false) — same exit code, no output
  if (isSelf(file) || waived.has(file)) return { found: false, readError: false };

  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (e) {
    io.stderr.write(`cannot read ${file}: ${e.message}\n`);
    // equivalent mutant (BooleanLiteral: found: true instead of false): this branch already sets
    // readError: true, which alone drives hasReadErrors and the blocking-exit OR; no finding line
    // is ever printed on this path, so found's value is unobservable
    return { found: false, readError: true };
  }

  const findings = findEntries(content);
  for (const entry of findings) io.stdout.write(`SLOP-FOUND(${file}): ${entry}\n`);
  return { found: findings.length > 0, readError: false };
}

/**
 * Main entrypoint for prose-lint logic. `argv` files are touched docs and,
 * at propose time, a PR-body file — every file is treated the same way, with
 * no branching on its origin. Advisory (default) always returns 0 but still
 * prints; blocking returns EXIT_FOUND iff findings or read errors exist.
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const { gate, waiverSources, files } = parseArgs(argv);
  const waived = collectWaived(waiverSources, io);

  let hasFindings = false;
  let hasReadErrors = false;
  for (const file of files) {
    const { found, readError } = scanFile(file, waived, io);
    hasFindings = hasFindings || found;
    hasReadErrors = hasReadErrors || readError;
  }

  return gate === 'blocking' && (hasFindings || hasReadErrors) ? EXIT_FOUND : EXIT_OK;
}
