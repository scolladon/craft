/**
 * Main entrypoint for init-land logic.
 * argv[0] = tmpPath, argv[1] = finalPath.
 * Exits 0 on successful lint+move; non-zero on lint failure or rename error.
 */

import { renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { land } from './init-land.js';

const EXIT_OK = 0;
const EXIT_ERR = 1;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST_LINT_SCRIPT = join(REPO_ROOT, 'scripts', 'manifest-lint.sh');

function buildLintDep() {
  return (tmpPath) => {
    try {
      execFileSync('bash', [MANIFEST_LINT_SCRIPT, tmpPath], { encoding: 'utf8' });
      return { exitCode: 0, errors: [] };
    } catch (err) {
      const lines = (err.stderr ?? '').split('\n').filter((line) => line.trim().length > 0);
      return {
        exitCode: err.status ?? EXIT_ERR,
        errors: lines.length > 0 ? lines : ['manifest lint failed'],
      };
    }
  };
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const tmpPath = argv[0];
  const finalPath = argv[1];

  if (!tmpPath || !finalPath) {
    io.stderr.write('init-land: usage: init-land <tmp-path> <final-path>\n');
    return EXIT_ERR;
  }

  const deps = {
    lint: buildLintDep(),
    rename: renameSync,
  };

  const result = land({ tmpPath, finalPath }, deps);

  if (!result.ok) {
    for (const err of result.errors) io.stderr.write(`${err}\n`);
    return EXIT_ERR;
  }

  io.stdout.write(`${result.path}\n`);
  return EXIT_OK;
}
