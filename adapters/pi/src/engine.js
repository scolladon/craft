/**
 * Engine-bin invocation wrapper for the Pi adapter.
 *
 * Pure orchestration — no engine business logic is duplicated here.
 * This module reuses the engine core byte-for-byte by shelling out to its
 * published bins via execFile (argv-array, never interpolated shell strings).
 *
 * Backlog file/custom sources and the worktree VCS scripts are called directly,
 * unchanged — binding those seams to Pi is handled in subsequent slices, not here.
 */

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

// adapters/pi/src → adapters/pi → adapters → repo root (three levels up)
const REPO_ROOT = join(__dir, '..', '..', '..');

const PIPELINE_RESOLVE_BIN = join(REPO_ROOT, 'engine', 'bin', 'pipeline-resolve.js');
const CONTRACT_ASSEMBLE_BIN = join(REPO_ROOT, 'engine', 'bin', 'contract-assemble.js');
const DEFAULT_PIPELINE = join(REPO_ROOT, 'pipeline', 'default.yml');
const CONTRACTS_DIR = join(REPO_ROOT, 'contracts');

/**
 * Run an executable via execFile, capturing stdout and stderr.
 * Non-zero exit rejects with a blocker error surfacing stderr.
 *
 * @param {string} file
 * @param {string[]} args - argv array; never interpolated into a shell string
 * @returns {Promise<string>} resolved stdout on success
 */
function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr.trim() || err.message;
        reject(new Error(`{ unit: engine-bin, reason: ${detail} }`));
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Return a new args array with manifestPath appended when provided.
 * Both call sites use this to conditionally thread the committed manifest.
 *
 * @param {string[]} args
 * @param {string|undefined} manifestPath
 * @returns {string[]}
 */
function withManifest(args, manifestPath) {
  return manifestPath ? [...args, manifestPath] : args;
}

/**
 * Resolve the effective pipeline by invoking the engine's pipeline-resolve bin.
 * Returns the parsed resolution object:
 *   { ok, effective, record, gateDecisions, waivers }
 * effective[i] carries model after the descriptor model-tier lift.
 *
 * @param {string} [manifestPath] optional path to a committed manifest; when
 *   given it is appended as the 2nd positional arg to pipeline-resolve so the
 *   engine can apply manifest-level skip/gate overrides.
 * @returns {Promise<{ ok: boolean, effective: object[], record: object, gateDecisions: object, waivers: object[] }>}
 */
export async function resolvePipeline(manifestPath) {
  const args = withManifest([PIPELINE_RESOLVE_BIN, DEFAULT_PIPELINE], manifestPath);
  const stdout = await run('node', args);
  return JSON.parse(stdout);
}

/**
 * Assemble the injected contract block for the given phase by invoking the
 * engine's contract-assemble bin.
 *
 * @param {string} phaseId
 * @param {string} [manifestPath] optional path to a committed manifest; when
 *   given it is forwarded as --manifest <path> so the engine injects manifest
 *   context values into the assembled block.
 * @returns {Promise<string>} the assembled block text
 */
export async function assembleBlock(phaseId, manifestPath) {
  const baseArgs = [
    CONTRACT_ASSEMBLE_BIN,
    '--descriptor-id', phaseId,
    '--contracts-dir', CONTRACTS_DIR,
  ];
  const args = manifestPath ? [...baseArgs, '--manifest', manifestPath] : baseArgs;
  const stdout = await run('node', args);
  return stdout;
}
