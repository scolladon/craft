#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePipeline } from '../src/descriptor.js';
import { resolvePipeline } from '../src/resolve.js';
import { applyCliOverlay } from '../src/cli-overlay.js';
import { parseManifestContent } from '../src/frontmatter.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CRAFT_PREFIX = 'craft:';
const roleExists = ref => {
  if (!ref.startsWith(CRAFT_PREFIX)) return true;
  const name = ref.slice(CRAFT_PREFIX.length);
  // A craft role is a bare name under agents/; a separator means a traversal ref
  // that could probe (and falsely satisfy) a file outside agents/ — reject it.
  if (name.includes('/') || name.includes('\\')) return false;
  return existsSync(join(REPO_ROOT, 'agents', name + '.md'));
};

/**
 * Parse CLI args into structured options.
 * Non-flag tokens fill positionals in order (1st=pipelinePath, 2nd=manifestPath).
 * Flags may appear anywhere.
 *
 * @param {string[]} argv
 * @returns {{ pipelinePath: string|null, manifestPath: string|null, profile: string|undefined, skip: string[]|undefined }}
 */
function parseArgs(argv) {
  let pipelinePath = null;
  let manifestPath = null;
  let profile;
  let skip;

  const takeValue = (i, flag) => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('-')) {
      process.stderr.write(`pipeline-resolve: option ${flag} requires a non-flag value\n`);
      process.exit(2);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profile') {
      profile = takeValue(i, arg);
      i++;
    } else if (arg === '--skip') {
      skip = takeValue(i, arg).split(',').map(s => s.trim()).filter(Boolean);
      i++;
    } else if (arg.startsWith('-')) {
      process.stderr.write(`pipeline-resolve: unknown option ${arg}\n`);
      process.exit(2);
    } else if (pipelinePath === null) {
      pipelinePath = arg;
    } else if (manifestPath === null) {
      manifestPath = arg;
    }
  }

  return { pipelinePath, manifestPath, profile, skip };
}

const { pipelinePath, manifestPath, profile, skip } = parseArgs(process.argv.slice(2));

if (!pipelinePath) {
  process.stderr.write('Usage: pipeline-resolve <pipeline.yml> [manifest.yml] [--profile <name>] [--skip <csv>]\n');
  process.exit(2);
}

let defaults;
try {
  defaults = parsePipeline(readFileSync(pipelinePath, 'utf8'));
} catch (err) {
  process.stderr.write(`pipeline-resolve: failed to parse pipeline: ${err.message}\n`);
  process.exit(2);
}

let manifest = null;
if (manifestPath) {
  try {
    manifest = parseManifestContent(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    process.stderr.write(`pipeline-resolve: failed to parse manifest: ${err.message}\n`);
    process.exit(2);
  }
}

const effectiveManifest = applyCliOverlay(manifest ?? {}, { profile, skip });

let resolution;
try {
  resolution = resolvePipeline(defaults, effectiveManifest, { roleExists });
} catch (err) {
  process.stderr.write(`pipeline-resolve: ${err.message}\n`);
  process.exit(2);
}

if (!resolution.ok) {
  for (const error of resolution.errors) {
    process.stderr.write(`  - ${error}\n`);
  }
  process.exit(2);
}

process.stdout.write(JSON.stringify(resolution, null, 2) + '\n');
process.exit(0);
