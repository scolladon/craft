import { readFileSync } from 'node:fs';
import { normalizeFindings } from './findings.js';

/**
 * Emit a normalize-findings error message to stderr.
 * @param {string} message
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {2}
 */
function fail(message, io) {
  io.stderr.write(`normalize-findings: ${message}\n`);
  return 2;
}

/**
 * Main entrypoint for normalize-findings logic.
 *
 * @param {string[]} argv — process.argv.slice(2)
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void }, readStdin: () => string }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  // Empty string (e.g. `argv[0] = ''`) falls through to stdin rather than reading ''.
  const filePath = argv[0] || null;

  let raw;
  try {
    raw = filePath ? readFileSync(filePath, 'utf8') : io.readStdin();
  } catch (err) {
    return fail(err.message, io);
  }

  let findings;
  try {
    findings = normalizeFindings(raw);
  } catch (err) {
    return fail(err.message, io);
  }

  io.stdout.write(JSON.stringify(findings, null, 2) + '\n');
  return 0;
}
