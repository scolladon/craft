import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManifestContent } from './frontmatter.js';
import { parsePipeline } from './descriptor.js';
import { assembleContract } from './contract.js';
import { BUNDLE_VOCAB } from './graph.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dir, '..', '..');

// Single vocab home — the fragment set is exactly the closed bundle vocabulary.
const BUNDLE_NAMES = [...BUNDLE_VOCAB];

/**
 * Parse CLI args into a structured options object.
 * Returns null and signals the error via io when an option error is encountered.
 *
 * @param {string[]} argv
 * @param {{ stderr: { write(s: string): void } }} io
 * @returns {{ descriptorId: string|null, manifestPath: string|null, inline: boolean, contractsDir: string }|null}
 */
function parseArgs(argv, io) {
  let descriptorId = null;
  let manifestPath = null;
  let inline = false;
  let contractsDir = join(REPO_ROOT, 'contracts');

  const takeValue = (i, flag) => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      io.stderr.write(`contract-assemble: option ${flag} requires a non-flag value\n`);
      return null;
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--descriptor-id') {
      const value = takeValue(i, arg);
      if (value === null) return null;
      descriptorId = value;
      i++;
    } else if (arg === '--manifest') {
      const value = takeValue(i, arg);
      if (value === null) return null;
      manifestPath = value;
      i++;
    } else if (arg === '--inline') {
      inline = true;
    } else if (arg === '--contracts-dir') {
      const value = takeValue(i, arg);
      if (value === null) return null;
      contractsDir = value;
      i++;
    }
  }

  return { descriptorId, manifestPath, inline, contractsDir };
}

/**
 * Load all contract fragments from the given directory.
 *
 * @param {string} contractsDir
 * @returns {Record<string, string>}
 */
function loadFragments(contractsDir) {
  return Object.fromEntries(
    BUNDLE_NAMES.map(name => [name, readFileSync(join(contractsDir, `${name}.md`), 'utf8')]),
  );
}

/**
 * Main entry point for contract-assemble logic.
 * All I/O is injected via `io`; returns an exit code — never calls process.*.
 *
 * @param {string[]} argv - process.argv.slice(2) equivalent
 * @param {{ stdout: { write(s: string): void }, stderr: { write(s: string): void } }} io
 * @returns {number} exit code
 */
export function main(argv, io) {
  const parsed = parseArgs(argv, io);
  if (parsed === null) return 2;

  const { descriptorId, manifestPath, inline, contractsDir } = parsed;

  if (!descriptorId) {
    io.stderr.write('Usage: contract-assemble.js --descriptor-id <id> [--manifest <path>] [--inline] [--contracts-dir <dir>]\n');
    return 2;
  }

  let descriptors;
  try {
    const pipelinePath = join(REPO_ROOT, 'pipeline', 'default.yml');
    descriptors = parsePipeline(readFileSync(pipelinePath, 'utf8'));
  } catch (err) {
    io.stderr.write(`contract-assemble: failed to parse pipeline: ${err.message}\n`);
    return 2;
  }

  const descriptor = descriptors.find(d => d.id === descriptorId);
  if (!descriptor) {
    io.stderr.write(
      `contract-assemble: unknown descriptor-id "${descriptorId}". ` +
      `Known ids: ${descriptors.map(d => d.id).join(', ')}\n`,
    );
    return 2;
  }

  // The manifest `context:` is injected verbatim as trusted operator input. The caller
  // MUST have run manifest-lint against this path and confirmed exit 0 first —
  // manifest-lint is the only validation gate for `context:` content (run/SKILL.md step 1).
  let manifest = {};
  if (manifestPath) {
    try {
      manifest = parseManifestContent(readFileSync(manifestPath, 'utf8')) ?? {};
    } catch (err) {
      io.stderr.write(`contract-assemble: failed to parse manifest: ${err.message}\n`);
      return 2;
    }
  }

  let fragments;
  try {
    fragments = loadFragments(contractsDir);
  } catch (err) {
    io.stderr.write(`contract-assemble: failed to load contract fragments: ${err.message}\n`);
    return 2;
  }

  let block;
  try {
    block = assembleContract(descriptor, manifest, fragments, { execution: inline ? 'inline' : 'agent' });
  } catch (err) {
    io.stderr.write(`contract-assemble: ${err.message}\n`);
    return 2;
  }

  io.stdout.write(block + '\n');
  return 0;
}
