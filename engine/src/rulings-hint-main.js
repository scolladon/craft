/**
 * `rulings-hint` — the rulings settled for the paths a phase touches, read from the
 * working-tree register. Advisory: every failure but a usage error is a stderr note and exit 0.
 */

import { readFileSync } from 'node:fs';
import { safeLabel } from './cli-io.js';
import { parseRegister, sliceRulings } from './rulings.js';

const EXIT_OK = 0;
const EXIT_USAGE = 2;

const USAGE = 'usage: rulings-hint --register <file>\n';
const NOTE_PREFIX = 'craft-rulings-hint:';
const HEADER = 'Rulings (settled for these paths — a proposal that re-opens one escalates):';
const REGISTER_FLAG = '--register';

const DEFAULT_DEPS = Object.freeze({
  readFile: (path) => readFileSync(path, 'utf8'),
  readStdin: () => readFileSync(0, 'utf8'),
});

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] !== REGISTER_FLAG || argv[i + 1] === undefined) return null;
    options.register = argv[i + 1];
  }
  return options.register ? options : null;
}

function parseScope(text) {
  return [...new Set(text.split('\n').map((line) => line.trim()).filter((line) => line !== ''))];
}

function formatHint({ matched, pathless }, register) {
  if (matched.length === 0) return '';
  const tail = pathless > 0 ? [`(${pathless} rulings carry no paths — search ${safeLabel(register)} by topic)`] : [];
  return `${[HEADER, ...matched.map((ruling) => safeLabel(ruling.raw)), ...tail].join('\n')}\n`;
}

function buildHint(register, scope, readFile) {
  const { rulings, errors } = parseRegister(readFile(register));
  if (errors.length > 0) throw new Error(`${safeLabel(register)} has parse errors (line ${errors[0].line}: ${errors[0].message})`);
  return formatHint(sliceRulings(rulings, scope), register);
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {Partial<typeof DEFAULT_DEPS>} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const { readFile, readStdin } = { ...DEFAULT_DEPS, ...deps };
  const options = parseArgs(argv);
  if (!options) {
    io.stderr.write(USAGE);
    return EXIT_USAGE;
  }
  try {
    io.stdout.write(buildHint(options.register, parseScope(readStdin()), readFile));
  } catch (error) {
    io.stderr.write(`${NOTE_PREFIX} ${safeLabel(error.message)}\n`);
  }
  return EXIT_OK;
}
