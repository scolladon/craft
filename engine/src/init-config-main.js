/**
 * Main entrypoint for init-config logic.
 * argv[0] = name, resolved against process.cwd() (the repo root).
 * Prints resolved relative path to stdout on ok; writes error to stderr + non-zero on !ok.
 */

import { relative, resolve } from 'node:path';
import { resolveConfigPath } from './init-config.js';

const EXIT_OK = 0;
const EXIT_ERR = 1;

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const name = argv[0];
  if (!name) {
    io.stderr.write('init-config: name argument required\n');
    return EXIT_ERR;
  }

  const repoRoot = resolve(process.cwd());
  const resolution = resolveConfigPath(repoRoot, name);

  if (!resolution.ok) {
    io.stderr.write(`init-config: ${resolution.error}\n`);
    return EXIT_ERR;
  }

  const rel = relative(repoRoot, resolution.path);
  io.stdout.write(`${rel}\n`);
  return EXIT_OK;
}
