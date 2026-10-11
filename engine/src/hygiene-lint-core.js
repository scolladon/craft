/**
 * `hygiene-lint-core` — the shared engine behind the `stub-lint` and
 * `prose-lint` gates. Both gates are the same machine: parse argv, collect
 * per-file waivers, scan each file, and (under `--gate blocking`) fail on any
 * finding or read error. Each gate passes its own `ctx`:
 * `{ self, waiverPattern, foundToken, scan }` — the gate's own module path (for
 * self-exclusion), its `SLOP/STUB-WAIVE` regex, its FOUND token, and its
 * `scan(content) → string[]` (which closes over the gate's marker/ban list).
 * Everything else lives here once, including the waiver grammar: a waiver is a
 * line that starts with the token and `: <reason>`, outside a fenced code block.
 */

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export const EXIT_OK = 0;
export const EXIT_FOUND = 2;
// Files above this size are skipped with a loud note rather than read into
// memory — a touched lockfile / generated bundle is never a stub/prose target.
export const MAX_FILE_BYTES = 5_000_000;

/**
 * Escape regex metacharacters in a literal so it can be embedded in a `new
 * RegExp` source and match only itself. The ban list is user-curated, so a
 * metacharacter entry must not build a broken or over-matching pattern.
 * @param {string} literal
 * @returns {string}
 */
export function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string[]} argv
 * @returns {{ gate: string, waiverSources: string[], files: string[] }}
 */
export function parseArgs(argv) {
  const waiverSources = [];
  const files = [];
  let gate = 'advisory'; // equivalent mutant (StringLiteral default, e.g. ''): gate is only ever compared via `=== 'blocking'`, so any non-'blocking' default is observably identical
  let optionsEnded = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!optionsEnded && arg === '--') {
      // lone `--` ends option parsing: everything after is a file, even if it
      // begins with `--` (ci.sh passes `--` before the touched-file list).
      optionsEnded = true;
    } else if (!optionsEnded && arg === '--gate') {
      if (i + 1 >= argv.length) continue; // dangling flag with no value: ignore, don't degrade
      gate = argv[i + 1];
      i += 1;
    } else if (!optionsEnded && arg === '--waiver-source') {
      if (i + 1 >= argv.length) continue; // dangling flag with no value: ignore, don't push undefined
      waiverSources.push(argv[i + 1]);
      i += 1;
    } else {
      files.push(arg);
    }
  }
  return { gate, waiverSources, files };
}

/**
 * A fenced code block opens on 3+ backticks (no backtick in the info string) or
 * 3+ tildes, at any indentation; the run is captured to match its closer. A
 * closer indented more than three columns past its opener is fence content, as
 * in CommonMark, where a list item's fence is measured from the item's indent.
 */
const FENCE_OPENER = /^([ \t]*)(?:(`{3,})[^`]*|(~{3,}).*)$/;
const FENCE_CLOSER = /^([ \t]*)(`{3,}|~{3,})[ \t]*$/;
const MAX_CLOSER_EXTRA_INDENT = 3;
const TAB_WIDTH = 4;
// CRLF sources split to the same lines as LF ones, so no pattern sees a `\r`.
const LINE_BREAK = /\r?\n/;

/**
 * @param {string} indent leading spaces and tabs
 * @returns {number} the indent's width in columns
 */
function indentWidth(indent) {
  return indent.replaceAll('\t', ' '.repeat(TAB_WIDTH)).length;
}

/**
 * @param {string} line
 * @returns {{ indent: number, run: string }|undefined} the opener's indent width and
 *   run, or undefined when the line opens no fence
 */
function openedFence(line) {
  const match = FENCE_OPENER.exec(line);
  return match ? { indent: indentWidth(match[1]), run: match[2] ?? match[3] } : undefined;
}

/**
 * A closer uses the opener's character, is at least as long, sits at most three
 * columns past the opener's indent, and carries no text.
 * @param {string} line
 * @param {{ indent: number, run: string }} fence the open fence
 * @returns {boolean}
 */
function closesFence(line, fence) {
  const match = FENCE_CLOSER.exec(line);
  if (match === null) return false;
  const [, indent, run] = match;
  const withinIndent = indentWidth(indent) - fence.indent <= MAX_CLOSER_EXTRA_INDENT;
  return withinIndent && run[0] === fence.run[0] && run.length >= fence.run.length;
}

/**
 * The lines of `content` outside fenced code blocks. An unclosed fence runs to
 * the end of the content.
 * @param {string} content
 * @returns {string[]}
 */
function unfencedLines(content) {
  const lines = [];
  let fence; // the open fence; undefined outside a fence
  for (const line of content.split(LINE_BREAK)) {
    if (fence !== undefined) {
      fence = closesFence(line, fence) ? undefined : fence;
      continue;
    }
    fence = openedFence(line);
    // equivalent mutant (ConditionalExpression forced true): it also keeps the opener line, which starts with whitespace, a backtick or a tilde, so no anchored waiver pattern can match it
    if (fence === undefined) lines.push(line);
  }
  return lines;
}

// A waiver states why it waives: the token is followed by `:` and a non-empty reason.
const WAIVER_REASON = String.raw`:\s*\S`;

/**
 * Anchor a gate's bare waiver pattern to the start of a line and require a
 * reason. Rebuilding from `source` drops the gate's `g` flag, so `exec` keeps no
 * state between lines; the `(?:...)` wrapper keeps the waived path in group 1.
 * @param {RegExp} waiverPattern
 * @returns {RegExp}
 */
function anchorWaiver(waiverPattern) {
  return new RegExp(`^(?:${waiverPattern.source})${WAIVER_REASON}`);
}

/**
 * @param {string} content
 * @param {RegExp} anchored
 * @returns {string[]} the trimmed path of every waiver line
 */
function waivedPaths(content, anchored) {
  const paths = [];
  for (const line of unfencedLines(content)) {
    const match = anchored.exec(line);
    if (match) paths.push(match[1].trim());
  }
  return paths;
}

/**
 * Collect waived file paths from `--waiver-source` files. A waiver is a line
 * that starts with the gate's token followed by `: <reason>`, outside a fenced
 * code block; the token anywhere else is a mention and waives nothing. An
 * unreadable source is a loud stderr line, handled (never swallowed), then skipped.
 * @param {string[]} waiverSources
 * @param {{ stderr: { write(s: string): void } }} io
 * @param {RegExp} waiverPattern the gate's bare token regex, waived path in group 1;
 *   collectWaived anchors it to a line start and requires `: <reason>`
 * @param {number} [maxBytes] size cap (defaults to MAX_FILE_BYTES); a too-large
 *   waiver source is skipped with a note, same as a scanned file
 * @returns {{ waived: Set<string>, readError: boolean }} paths resolved to absolute;
 *   readError is true if any requested source was unreadable (gates under blocking)
 */
export function collectWaived(waiverSources, io, waiverPattern, maxBytes = MAX_FILE_BYTES, base = process.cwd()) {
  const anchored = anchorWaiver(waiverPattern);
  const waived = new Set();
  let readError = false;
  for (const source of waiverSources) {
    const { content, readError: sourceError } = readWithinCap(source, io, maxBytes, `waiver source ${source}`);
    if (sourceError) {
      readError = true;
      continue;
    }
    if (content === undefined) continue; // skipped (too large)
    // Resolve the capture so ./x, absolute, and trailing-slash variants all
    // land on the same key as the resolved scanned path.
    for (const path of waivedPaths(content, anchored)) waived.add(resolve(base, path));
  }
  return { waived, readError };
}

/**
 * Read a file guarded by the size cap: statSync first, skip-with-note over the
 * cap, then read. Shared by the scan path and waiver collection so the DoS cap
 * covers both. `label` names the file in stderr messages (e.g. `waiver source x`).
 * @param {string} path
 * @param {{ stderr: { write(s: string): void } }} io
 * @param {number} maxBytes
 * @param {string} label
 * @returns {{ content?: string, readError?: boolean }} content on success (may be
 *   ''), readError:true on an unreadable path, or {} when skipped (too large)
 */
export function readWithinCap(path, io, maxBytes, label) {
  let stat;
  try {
    stat = statSync(path);
  } catch (e) {
    io.stderr.write(`cannot read ${label}: ${e.message}\n`);
    return { readError: true };
  }
  if (stat.size > maxBytes) {
    // A too-large file is skipped, not failed: neither a finding nor unreadable.
    io.stderr.write(`skipping ${label}: ${stat.size} bytes exceeds ${maxBytes} limit\n`);
    return {};
  }
  try {
    return { content: readFileSync(path, 'utf8') };
  } catch (e) {
    io.stderr.write(`cannot read ${label}: ${e.message}\n`);
    return { readError: true };
  }
}

/**
 * Scan one file, printing findings to stdout and read errors to stderr. Skips
 * the gate's own source (self) and any waived path; caps oversized files.
 * @param {string} file
 * @param {Set<string>} waived
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {{ self: string, foundToken: string, scan: (content: string) => string[], maxBytes?: number }} ctx
 * @returns {{ found: boolean, readError: boolean }}
 */
export function scanFile(file, waived, io, ctx) {
  // equivalent mutant (ObjectLiteral: return {} instead of { found: false, readError: false }):
  // the destructured found/readError are then undefined, and `hasFindings = hasFindings || found`
  // keeps hasFindings false either way (undefined is as falsy as false) — same exit code, no output
  const resolved = resolve(process.cwd(), file); // one resolve: reused for self- and waiver-exclusion
  if (resolved === ctx.self || waived.has(resolved)) return { found: false, readError: false };

  const { content, readError } = readWithinCap(file, io, ctx.maxBytes ?? MAX_FILE_BYTES, file);
  // equivalent mutant (BooleanLiteral: found: true on the readError path): readError alone drives
  // hasReadErrors and the blocking-exit OR; no finding line is printed, so found is unobservable
  if (readError) return { found: false, readError: true };
  if (content === undefined) return { found: false, readError: false }; // skipped (too large): neutral

  const findings = ctx.scan(content);
  for (const finding of findings) io.stdout.write(`${ctx.foundToken}(${file}): ${finding}\n`);
  return { found: findings.length > 0, readError: false };
}

/**
 * Shared entrypoint for both gates. `argv` files are pre-filtered paths (ci.sh
 * does the diffing) and, at propose, a PR-body file — every file is treated the
 * same way, with no branching on its origin. Advisory (default) always returns 0
 * but still prints; blocking returns EXIT_FOUND iff findings or read errors exist.
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {{ self: string, waiverPattern: RegExp, foundToken: string,
 *   scan: (content: string) => string[], maxBytes?: number }} ctx
 *   (`maxBytes` is a test-only cap override; production uses MAX_FILE_BYTES)
 * @returns {number} exit code
 */
export function main(argv, io, ctx) {
  const { gate, waiverSources, files } = parseArgs(argv);
  const { waived, readError: waiverReadError } = collectWaived(waiverSources, io, ctx.waiverPattern, ctx.maxBytes);

  let hasFindings = false;
  let hasReadErrors = waiverReadError;
  for (const file of files) {
    const { found, readError } = scanFile(file, waived, io, ctx);
    hasFindings = hasFindings || found;
    hasReadErrors = hasReadErrors || readError;
  }

  return gate === 'blocking' && (hasFindings || hasReadErrors) ? EXIT_FOUND : EXIT_OK;
}
