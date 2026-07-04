/**
 * `stub-lint` — deterministic pre-completion gate over touched source: greps a
 * fixed marker set and reports `STUB-FOUND` lines. Mirrors intention-lint's
 * bin+src shape (`../bin/stub-lint.js` → this module's `main(argv, io)`).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXIT_OK = 0;
const EXIT_FOUND = 2;

const MARKERS = Object.freeze(['TODO', 'FIXME', 'HACK', 'XXX', 'PLACEHOLDER', 'STUB']);
const SELF = fileURLToPath(import.meta.url);
const WAIVER_PATTERN = /STUB-WAIVE\(([^)]+)\)/g;

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
 * @param {string} content
 * @returns {string[]} `<MARKER>@L<n>` findings, marker upper-cased, 1-based line
 */
function findMarkers(content) {
  const pattern = new RegExp(`\\b(${MARKERS.join('|')})\\b`, 'gi');
  const findings = [];
  content.split('\n').forEach((line, idx) => {
    for (const match of line.matchAll(pattern)) {
      findings.push(`${match[1].toUpperCase()}@L${idx + 1}`);
    }
  });
  return findings;
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

  const findings = findMarkers(content);
  for (const finding of findings) io.stdout.write(`STUB-FOUND(${file}): ${finding}\n`);
  return { found: findings.length > 0, readError: false };
}

/**
 * Main entrypoint for stub-lint logic. `argv` is pre-filtered source file
 * paths (ci.sh does the diffing); this module does no git I/O. Advisory
 * (default) always returns 0 but still prints; blocking returns EXIT_FOUND
 * iff findings or read errors exist.
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
