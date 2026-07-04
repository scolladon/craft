/**
 * CLI entrypoint for the promote-plan decision computer: parses argv/flags,
 * builds real-filesystem deps, and renders the plan as a three-line
 * key=value stdout contract the promote-config skill parses.
 */

import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { planPromote } from './promote-plan.js';
import { containByRealpath as nodeContainByRealpath } from './contain.js';
import { isRegularFile, fail, EXIT_OK, EXIT_ERR } from './cli-io.js';

const MISSING_NAME_MESSAGE = 'promote-plan: name argument required\n';

function parseArgs(argv) {
  return {
    name: argv[0],
    demote: argv.includes('--demote'),
    force: argv.includes('--force'),
  };
}

function refusalMessage(error) {
  return `promote-plan: ${error}\n`;
}

function reportPlan(io, plan) {
  io.stdout.write(`source=${plan.sourcePath}\n`);
  io.stdout.write(`dest=${plan.destPath}\n`);
  io.stdout.write(`scope=${plan.destScope}\n`);
  return EXIT_OK;
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {{ homeDir?: () => string, fileExists?: (p: string) => boolean, containByRealpath?: (root: string, target: string) => string|null }} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const { name, demote, force } = parseArgs(argv);
  if (!name) return fail(io, MISSING_NAME_MESSAGE);

  const homeDir = deps.homeDir ?? homedir;
  const planDeps = {
    repoRoot: resolve(process.cwd()),
    homeDir: homeDir(),
    fileExists: deps.fileExists ?? isRegularFile,
    containByRealpath: deps.containByRealpath ?? nodeContainByRealpath,
  };

  const plan = planPromote({ name, demote, force }, planDeps);
  if (!plan.ok) return fail(io, refusalMessage(plan.error));

  return reportPlan(io, plan);
}
