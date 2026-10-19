/**
 * `lesson-lint` — the whole-corpus form lint over one lessons directory. Form errors
 * exit 2; evidence that no longer resolves is only reported.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseLesson, evidencePath } from './lesson.js';
import { findRepoRoot, isDirectoryPath } from './cli-io.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const USAGE = 'usage: lesson-lint <lessons-dir>\n';
const FILENAME = /^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const HOME_ROOTED = /\$HOME|\$\{HOME\}|~\/|\/(?:Users|home)\/[^\s/]+/;
const BAD_FILENAME = 'filename must be NNN-<slug>.md';
const HOME_REFERENCE = 'home-rooted path or $HOME reference';
const SUPERSEDED = 'superseded';

const DEFAULT_DEPS = {
  readFile: (p) => readFileSync(p, 'utf8'),
  listDir: readdirSync,
  pathExists: existsSync,
  cwd: () => process.cwd(),
};

function fileNumber(name) {
  const match = FILENAME.exec(name);
  return match ? Number(match[1]) : null;
}

function checkFile(name, content) {
  const number = fileNumber(name);
  const errors = [];
  if (number === null) errors.push(BAD_FILENAME);
  if (HOME_ROOTED.test(content)) errors.push(HOME_REFERENCE);
  const parsed = parseLesson(content);
  if (parsed.errors) return { errors: [...errors, ...parsed.errors] };
  const { lesson } = parsed;
  if (number !== null && lesson.number !== number) {
    errors.push(`H1 number ${lesson.number} does not match filename number ${number}`);
  }
  return { errors, lesson };
}

function duplicateErrors(entries) {
  const seen = new Set();
  const errors = [];
  for (const { label, lesson } of entries) {
    if (seen.has(lesson.number)) errors.push({ label, error: `duplicate lesson number ${lesson.number}` });
    seen.add(lesson.number);
  }
  return errors;
}

function supersedesErrors({ label, lesson }, byNumber) {
  return lesson.supersedes.flatMap((target) => {
    const found = byNumber.get(target);
    if (!found) return [{ label, error: `supersedes ${target} names no lesson` }];
    if (found.status !== SUPERSEDED) return [{ label, error: `supersedes ${target} which is not superseded` }];
    return [];
  });
}

function orphanErrors({ label, lesson }, supersededNumbers) {
  if (lesson.status !== SUPERSEDED || supersededNumbers.has(lesson.number)) return [];
  return [{ label, error: 'superseded but no lesson supersedes it' }];
}

function crossFileErrors(entries) {
  const byNumber = new Map(entries.map(({ lesson }) => [lesson.number, lesson]));
  const named = new Set(entries.flatMap(({ lesson }) => lesson.supersedes));
  return [
    ...duplicateErrors(entries),
    ...entries.flatMap((entry) => supersedesErrors(entry, byNumber)),
    ...entries.flatMap((entry) => orphanErrors(entry, named)),
  ];
}

function staleEvidence(entries, repoRoot, pathExists) {
  return entries.flatMap(({ label, lesson }) => lesson.evidence
    .filter((entry) => !pathExists(join(repoRoot, evidencePath(entry))))
    .map((entry) => `craft-lessons: stale-evidence ${label}: ${entry}\n`));
}

function failInvalid(errors, io) {
  io.stderr.write('craft-lessons: INVALID corpus:\n');
  for (const { label, error } of errors) io.stderr.write(`- ${label}: ${error}\n`);
  return EXIT_INVALID;
}

function inspectCorpus(argvDir, dir, deps) {
  const names = deps.listDir(dir).filter((name) => name.endsWith('.md')).sort();
  const errors = [];
  const entries = [];
  for (const name of names) {
    const label = join(argvDir, name);
    const checked = checkFile(name, deps.readFile(join(dir, name)));
    errors.push(...checked.errors.map((error) => ({ label, error })));
    if (checked.lesson) entries.push({ label, lesson: checked.lesson });
  }
  return { count: names.length, errors: [...errors, ...crossFileErrors(entries)], entries };
}

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
  const dir = resolve(resolved.cwd(), argv[0]);
  if (!isDirectoryPath(dir)) {
    io.stdout.write(`craft-lessons: no lessons directory at ${argv[0]}\n`);
    return EXIT_OK;
  }
  const corpus = inspectCorpus(argv[0], dir, resolved);
  if (corpus.errors.length > 0) return failInvalid(corpus.errors, io);
  const repoRoot = findRepoRoot(resolved.cwd());
  for (const line of staleEvidence(corpus.entries, repoRoot, resolved.pathExists)) io.stdout.write(line);
  io.stdout.write(`craft-lessons: OK — ${corpus.count} lesson(s) valid.\n`);
  return EXIT_OK;
}
