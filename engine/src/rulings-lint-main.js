/**
 * `rulings-lint` — the form lint over one decision register file. Any finding exits 2.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRegister, registerFindings } from './rulings.js';
import { isRegularFile, safeLabel } from './cli-io.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const USAGE = 'usage: rulings-lint <register-file>\n';

const DEFAULT_DEPS = Object.freeze({
  readFile: (p) => readFileSync(p, 'utf8'),
  isRegularFile,
  cwd: () => process.cwd(),
});

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {Partial<typeof DEFAULT_DEPS>} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const resolved = { ...DEFAULT_DEPS, ...deps };
  if (argv.length !== 1) {
    io.stderr.write(USAGE);
    return EXIT_INVALID;
  }
  const label = safeLabel(argv[0]);
  const file = resolve(resolved.cwd(), argv[0]);
  if (!resolved.isRegularFile(file)) {
    io.stdout.write(`rulings-lint: no such file ${label}\n`);
    return EXIT_INVALID;
  }
  const content = resolved.readFile(file);
  const findings = registerFindings(content);
  for (const { line, message } of findings) io.stdout.write(`rulings-lint: ${label}:${line}: ${safeLabel(message)}\n`);
  if (findings.length > 0) return EXIT_INVALID;
  io.stdout.write(`rulings-lint: ${parseRegister(content).rulings.length} rulings — OK\n`);
  return EXIT_OK;
}
