import { readFileSync } from 'node:fs';
import { parseScopeSpec, filterFindings } from './findings.js';

const SCOPE_FLAG = '--scope';

/**
 * Emit a filter-findings error message to stderr.
 * @param {string} message
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {2}
 */
function fail(message, io) {
  io.stderr.write(`filter-findings: ${message}\n`);
  return 2;
}

/**
 * Pulls `--scope <value>` out of argv; whatever positional remains is the
 * input path (or null, meaning stdin).
 *
 * @param {string[]} argv
 * @returns {{ scope: string, filePath: string | null } | { error: string }}
 */
function parseArgs(argv) {
  const scopeIndex = argv.indexOf(SCOPE_FLAG);
  if (scopeIndex === -1) {
    return { error: 'missing --scope' };
  }
  const scope = argv[scopeIndex + 1];
  const positionals = [...argv.slice(0, scopeIndex), ...argv.slice(scopeIndex + 2)];
  return { scope, filePath: positionals[0] || null };
}

/**
 * Main entrypoint for filter-findings logic. Consumes a canonical `Finding[]`
 * — never raw technique output, so the engine stays technique-agnostic —
 * and a single comma-joined scope spec, and emits the findings falling
 * inside that scope.
 *
 * @param {string[]} argv — process.argv.slice(2)
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void }, readStdin: () => string }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const args = parseArgs(argv);
  if ('error' in args) {
    return fail(args.error, io);
  }
  const { scope, filePath } = args;

  let raw;
  try {
    raw = filePath ? readFileSync(filePath, 'utf8') : io.readStdin();
  } catch (err) {
    return fail(err.message, io);
  }

  let findings;
  try {
    const ranges = parseScopeSpec(scope);
    findings = filterFindings(JSON.parse(raw), ranges);
  } catch (err) {
    return fail(err.message, io);
  }

  io.stdout.write(JSON.stringify(findings, null, 2) + '\n');
  return 0;
}
