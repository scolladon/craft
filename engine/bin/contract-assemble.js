#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { parsePipeline } from '../src/descriptor.js';
import { assembleContract } from '../src/contract.js';
import { BUNDLE_VOCAB } from '../src/graph.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');

// Single vocab home — the fragment set is exactly the closed bundle vocabulary.
const BUNDLE_NAMES = [...BUNDLE_VOCAB];

/**
 * Parse CLI args into a structured options object.
 * @param {string[]} argv
 * @returns {{ descriptorId: string|null, manifestPath: string|null, inline: boolean, contractsDir: string }}
 */
function parseArgs(argv) {
  let descriptorId = null;
  let manifestPath = null;
  let inline = false;
  let contractsDir = join(REPO_ROOT, 'contracts');

  const takeValue = (i, flag) => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      process.stderr.write(`contract-assemble: option ${flag} requires a non-flag value\n`);
      process.exit(2);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--descriptor-id') {
      descriptorId = takeValue(i, arg);
      i++;
    } else if (arg === '--manifest') {
      manifestPath = takeValue(i, arg);
      i++;
    } else if (arg === '--inline') {
      inline = true;
    } else if (arg === '--contracts-dir') {
      contractsDir = takeValue(i, arg);
      i++;
    }
  }

  return { descriptorId, manifestPath, inline, contractsDir };
}

/**
 * Load all 7 contract fragments from the given directory.
 * @param {string} contractsDir
 * @returns {Record<string, string>}
 */
function loadFragments(contractsDir) {
  return Object.fromEntries(
    BUNDLE_NAMES.map(name => [name, readFileSync(join(contractsDir, `${name}.md`), 'utf8')]),
  );
}

const args = parseArgs(process.argv.slice(2));

if (!args.descriptorId) {
  process.stderr.write('Usage: contract-assemble.js --descriptor-id <id> [--manifest <path>] [--inline] [--contracts-dir <dir>]\n');
  process.exit(2);
}

let descriptors;
try {
  const pipelinePath = join(REPO_ROOT, 'pipeline', 'default.yml');
  descriptors = parsePipeline(readFileSync(pipelinePath, 'utf8'));
} catch (err) {
  process.stderr.write(`contract-assemble: failed to parse pipeline: ${err.message}\n`);
  process.exit(2);
}

const descriptor = descriptors.find(d => d.id === args.descriptorId);
if (!descriptor) {
  process.stderr.write(`contract-assemble: unknown descriptor-id "${args.descriptorId}". ` +
    `Known ids: ${descriptors.map(d => d.id).join(', ')}\n`);
  process.exit(2);
}

// The manifest `context:` is injected verbatim as trusted operator input. The caller
// MUST have run manifest-lint against this path and confirmed exit 0 first —
// manifest-lint is the only validation gate for `context:` content (run/SKILL.md step 1).
let manifest = {};
if (args.manifestPath) {
  try {
    manifest = load(readFileSync(args.manifestPath, 'utf8')) ?? {};
  } catch (err) {
    process.stderr.write(`contract-assemble: failed to parse manifest: ${err.message}\n`);
    process.exit(2);
  }
}

let fragments;
try {
  fragments = loadFragments(args.contractsDir);
} catch (err) {
  process.stderr.write(`contract-assemble: failed to load contract fragments: ${err.message}\n`);
  process.exit(2);
}

let block;
try {
  block = assembleContract(descriptor, manifest, fragments, { execution: args.inline ? 'inline' : 'agent' });
} catch (err) {
  process.stderr.write(`contract-assemble: ${err.message}\n`);
  process.exit(2);
}

process.stdout.write(block + '\n');
process.exit(0);
