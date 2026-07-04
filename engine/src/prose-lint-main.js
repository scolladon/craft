/**
 * `prose-lint` — deterministic gate over touched docs and the PR body: greps a
 * curated filler-phrase list and reports `SLOP-FOUND` lines. A thin adapter
 * over `hygiene-lint-core` (`../bin/prose-lint.js` → this module's
 * `main(argv, io)`); only the ban list, the whole-content `scan`, the token,
 * and the waiver regex are prose-specific.
 */

import { fileURLToPath } from 'node:url';
import { main as coreMain, escapeRegExp } from './hygiene-lint-core.js';

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
const FOUND_TOKEN = 'SLOP-FOUND';

// Compiled once, in BAN_LIST order. A single-token entry matches only on its own
// word boundaries (never as a substring of a longer word); a multi-word entry
// matches as a plain case-insensitive substring, so punctuation inside the entry
// (e.g. an apostrophe) is honored literally. Single-token entries are escaped so a
// metacharacter in the user-curated list can never build a broken/over-matching pattern.
const MATCHERS = BAN_LIST.map((entry) =>
  entry.includes(' ')
    ? { entry, phrase: entry.toLowerCase() }
    : { entry, re: new RegExp(`\\b${escapeRegExp(entry)}\\b`, 'i') },
);

/**
 * @param {string} content
 * @returns {string[]} BAN_LIST entries matched in content, one per entry, in list order
 */
function scan(content) {
  const lower = content.toLowerCase(); // lowercase once per file, not once per multi-word entry
  return MATCHERS.filter((m) => (m.re ? m.re.test(content) : lower.includes(m.phrase))).map((m) => m.entry);
}

/**
 * @param {string[]} argv touched docs and, at propose, a PR-body file
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  return coreMain(argv, io, { self: SELF, waiverPattern: WAIVER_PATTERN, foundToken: FOUND_TOKEN, scan });
}
