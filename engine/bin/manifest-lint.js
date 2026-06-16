#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { validateManifest } from '../src/index.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;

const DEFAULT_MANIFEST = '.claude/workflow.md';

/** @returns {string} */
function resolveManifestPath() {
  return process.argv[2] ?? DEFAULT_MANIFEST;
}

/**
 * Extract the YAML frontmatter block between the first and second `---` lines.
 * Returns null when no such block exists.
 *
 * Mirrors the awk in the original manifest-lint.sh:
 *   awk '/^---$/{n++; next} n==1{print} n>=2{exit}'
 *
 * @param {string} content
 * @returns {string|null}
 */
function extractFrontmatter(content) {
  const lines = content.split('\n');
  const collected = [];
  let delimCount = 0;

  for (const line of lines) {
    if (line === '---') {
      delimCount += 1;
      if (delimCount >= 2) break;
      continue;
    }
    if (delimCount === 1) collected.push(line);
  }

  if (delimCount < 1 || collected.length === 0) return null;
  return collected.join('\n');
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
  return (p) => existsSync(path.join(ROOT, p)) || existsSync(p);
}

const MF = resolveManifestPath();

if (!existsSync(MF)) {
  process.stdout.write(`forge-manifest: no manifest at ${MF} — pure defaults via capability probing.\n`);
  process.exit(EXIT_OK);
}

const content = readFileSync(MF, 'utf8');
const fm = extractFrontmatter(content);

if (fm === null) {
  process.stdout.write(`forge-manifest: ${MF} has no YAML frontmatter — pure defaults.\n`);
  process.exit(EXIT_OK);
}

const parsed = load(fm) ?? null;
const fileExists = buildFileExists(path.resolve(MF));
const { ok, errors } = validateManifest(parsed, { fileExists });

if (ok) {
  process.stdout.write(`forge-manifest: ${MF} valid.\n`);
  process.exit(EXIT_OK);
}

process.stderr.write(`forge-manifest: INVALID manifest ${MF}:\n`);
for (const err of errors) {
  process.stderr.write(`- ${err}\n`);
}
process.stderr.write('Fix the manifest — forge refuses to run on a misconfigured declination (fail loudly, never silently).\n');
process.exit(EXIT_INVALID);
