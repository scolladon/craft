/**
 * `stub-lint` — deterministic pre-completion gate over touched source: greps a
 * fixed marker set and reports `STUB-FOUND` lines. A thin adapter over
 * `hygiene-lint-core` (`../bin/stub-lint.js` → this module's `main(argv, io)`);
 * only the marker list, the per-line `scan`, the token, and the waiver regex
 * are stub-specific — all the argv/waiver/scan orchestration lives in the core.
 */

import { fileURLToPath } from 'node:url';
import { main as coreMain } from './hygiene-lint-core.js';

const MARKERS = Object.freeze(['TODO', 'FIXME', 'HACK', 'XXX', 'PLACEHOLDER', 'STUB']);
const SELF = fileURLToPath(import.meta.url);
const WAIVER_PATTERN = /STUB-WAIVE\(([^)]+)\)/g;
const FOUND_TOKEN = 'STUB-FOUND';
// Compiled once (MARKERS is frozen). `matchAll` clones the regexp internally, so
// reusing this global pattern across lines/files carries no lastIndex state.
const MARKER_PATTERN = new RegExp(`\\b(${MARKERS.join('|')})\\b`, 'gi');

/**
 * @param {string} content
 * @returns {string[]} `<MARKER>@L<n>` findings, marker upper-cased, 1-based line
 */
function scan(content) {
  const findings = [];
  content.split('\n').forEach((line, idx) => {
    for (const match of line.matchAll(MARKER_PATTERN)) {
      findings.push(`${match[1].toUpperCase()}@L${idx + 1}`);
    }
  });
  return findings;
}

/**
 * @param {string[]} argv pre-filtered source file paths (ci.sh does the diffing)
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  return coreMain(argv, io, { self: SELF, waiverPattern: WAIVER_PATTERN, foundToken: FOUND_TOKEN, scan });
}
