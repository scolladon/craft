#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { validateManifest } from '../src/index.js';
import { extractFrontmatter } from '../src/frontmatter.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const DEFAULT_MANIFEST = '.claude/workflow.md';

/** @returns {string} */
function resolveManifestPath() {
  return process.argv[2] ?? DEFAULT_MANIFEST;
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
 * Emit the standard INVALID-manifest diagnostic block to stderr and exit 2.
 * @param {string} mf
 * @param {string[]} errors
 * @returns {never}
 */
function failInvalid(mf, errors) {
  process.stderr.write(`forge-manifest: INVALID manifest ${mf}:\n`);
  for (const err of errors) process.stderr.write(`- ${err}\n`);
  process.stderr.write('Fix the manifest — forge refuses to run on a misconfigured declination (fail loudly, never silently).\n');
  process.exit(EXIT_INVALID);
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
  const ROOT = path.dirname(path.dirname(manifestAbsPath));
  return (p) => isRegularFile(path.join(ROOT, p)) || isRegularFile(p);
}

const MF = resolveManifestPath();

// A non-regular-file path (absent, a directory, a special file) → pure defaults, exit 0
// — mirrors the bash `[ ! -f "$MF" ]` guard.
if (!isRegularFile(MF)) {
  process.stdout.write(`forge-manifest: no manifest at ${MF} — pure defaults via capability probing.\n`);
  process.exit(EXIT_OK);
}

const content = readFileSync(MF, 'utf8');
const fm = extractFrontmatter(content);

if (fm === null) {
  process.stdout.write(`forge-manifest: ${MF} has no YAML frontmatter — pure defaults.\n`);
  process.exit(EXIT_OK);
}

let parsed;
try {
  parsed = load(fm) ?? null;
} catch (err) {
  failInvalid(MF, [`malformed YAML frontmatter: ${err.message}`]);
}

const fileExists = buildFileExists(path.resolve(MF));
const { ok, errors } = validateManifest(parsed, { fileExists });

if (ok) {
  process.stdout.write(`forge-manifest: ${MF} valid.\n`);
  process.exit(EXIT_OK);
}

failInvalid(MF, errors);
