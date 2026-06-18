import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { validateManifest } from './manifest.js';
import { extractFrontmatter } from './frontmatter.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const DEFAULT_MANIFEST = '.claude/workflow.md';

/**
 * @param {string[]} argv
 * @returns {string}
 */
function resolveManifestPath(argv) {
  return argv[0] ?? DEFAULT_MANIFEST;
}

/**
 * Regular-file predicate mirroring the bash `[ -f <path> ]` test: true only for an
 * existing regular file (a directory / special file / missing path → false), never throws.
 * @param {string} p
 * @returns {boolean}
 */
function isRegularFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Emit the standard INVALID-manifest diagnostic block to stderr.
 * @param {string} mf
 * @param {string[]} errors
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {number} EXIT_INVALID
 */
function failInvalid(mf, errors, io) {
  io.stderr.write(`craft-manifest: INVALID manifest ${mf}:\n`);
  for (const err of errors) io.stderr.write(`- ${err}\n`);
  io.stderr.write('Fix the manifest — craft refuses to run on a misconfigured declination (fail loudly, never silently).\n');
  return EXIT_INVALID;
}

/**
 * Build the fileExists closure that mirrors check_one_file in manifest-lint.sh.
 * ROOT is two directories above the manifest file (mirrors `dirname "$(dirname "$MF")"`)
 * so relative paths in the manifest resolve against the repo root.
 *
 * @param {string} manifestAbsPath
 * @returns {(p: string) => boolean}
 */
function buildFileExists(manifestAbsPath) {
  const ROOT = dirname(dirname(manifestAbsPath));
  return (p) => isRegularFile(join(ROOT, p)) || isRegularFile(p);
}

/**
 * Main entrypoint for manifest-lint logic.
 * @param {string[]} argv — process.argv.slice(2)
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const MF = resolveManifestPath(argv);

  if (!isRegularFile(MF)) {
    io.stdout.write(`craft-manifest: no manifest at ${MF} — pure defaults via capability probing.\n`);
    return EXIT_OK;
  }

  const content = readFileSync(MF, 'utf8');
  const fm = extractFrontmatter(content);

  if (fm === null) {
    io.stdout.write(`craft-manifest: ${MF} has no YAML frontmatter — pure defaults.\n`);
    return EXIT_OK;
  }

  let parsed;
  try {
    parsed = load(fm) ?? null;
  } catch (err) {
    return failInvalid(MF, [`malformed YAML frontmatter: ${err.message}`], io);
  }

  const fileExists = buildFileExists(resolve(MF));
  const { ok, errors } = validateManifest(parsed, { fileExists });

  if (ok) {
    io.stdout.write(`craft-manifest: ${MF} valid.\n`);
    return EXIT_OK;
  }

  return failInvalid(MF, errors, io);
}
