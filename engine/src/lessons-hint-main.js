/**
 * `lessons-hint` — the slot-1 lessons hint for one phase, read from a committed base
 * revision only so lessons drafted on the branch never reach a phase before review.
 * Advisory: every failure but a usage error is a stderr note and exit 0.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { consult, sliceLessons } from './intention.js';

const EXIT_OK = 0;
const EXIT_USAGE = 2;

const USAGE = 'usage: lessons-hint --phase <id> [--max <n>] [--dir <lessons-dir>] [--base <rev>]\n';
const NOTE_PREFIX = 'craft-lessons-hint:';
const HEADER = 'Lessons (advisory — open the path for context and evidence):';
const DEFAULT_MAX = 3;
const DEFAULT_DIR = 'docs/lessons';
const DEFAULT_BASE_CANDIDATES = ['origin/HEAD', 'main', 'master'];
const INDENT = '  ';
const FLAGS = new Set(['--phase', '--max', '--dir', '--base']);
const POSITIVE_INTEGER = /^[1-9]\d*$/;

const DEFAULT_DEPS = {
  git: (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
  readStdin: () => readFileSync(0, 'utf8'),
};

function parseArgs(argv) {
  const options = { max: DEFAULT_MAX, dir: DEFAULT_DIR };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!FLAGS.has(flag) || value === undefined) return null;
    options[flag.slice(2)] = value;
  }
  if (!options.phase) return null;
  if (!POSITIVE_INTEGER.test(String(options.max))) return null;
  return { ...options, max: Number(options.max) };
}

function resolveBase(explicit, git) {
  const candidates = explicit ? [explicit] : DEFAULT_BASE_CANDIDATES;
  const found = candidates.find((rev) => {
    try {
      git(['rev-parse', '--verify', '--quiet', rev]);
      return true;
    } catch {
      return false;
    }
  });
  if (!found) throw new Error(`no resolvable base revision (tried ${candidates.join(', ')})`);
  return found;
}

function listLessonPaths(base, dir, git) {
  const prefix = `${dir.replace(/\/+$/, '')}/`;
  const paths = git(['ls-tree', '--name-only', base, '--', prefix]).split('\n').filter((p) => p.endsWith('.md'));
  if (paths.length === 0) throw new Error(`no lessons under ${prefix} at ${base}`);
  return paths;
}

function formatLesson(row) {
  const lines = row.howToApply.split('\n').filter((line) => line.trim() !== '');
  return [`- ${row.title} — when ${row.trigger} → ${row.path}`, ...lines.map((line) => `${INDENT}${line}`)];
}

function formatHint(rows) {
  if (rows.length === 0) return '';
  return `${[HEADER, ...rows.flatMap(formatLesson)].join('\n')}\n`;
}

function buildHint({ phase, max, dir, base }, scope, git) {
  const resolved = resolveBase(base, git);
  const paths = listLessonPaths(resolved, dir, git);
  const view = consult(scope, {
    listCorpus: () => [],
    listLessons: () => paths,
    readPage: (path) => git(['show', `${resolved}:${path}`]),
  });
  return formatHint(sliceLessons(view.lessons, { phase, max }));
}

function parseScope(text) {
  return text.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

/**
 * @param {string[]} argv
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @param {Partial<typeof DEFAULT_DEPS>} [deps]
 * @returns {number} exit code
 */
export function main(argv, io, deps = {}) {
  const { git, readStdin } = { ...DEFAULT_DEPS, ...deps };
  const options = parseArgs(argv);
  if (!options) {
    io.stderr.write(USAGE);
    return EXIT_USAGE;
  }
  try {
    io.stdout.write(buildHint(options, parseScope(readStdin()), git));
  } catch (error) {
    io.stderr.write(`${NOTE_PREFIX} ${error.message}\n`);
  }
  return EXIT_OK;
}
