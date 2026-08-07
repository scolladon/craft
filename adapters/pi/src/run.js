import { execFile as _execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseManifestContent } from '../../../engine/src/frontmatter.js';
import { resolvePipeline as _resolvePipeline, assembleBlock as _assembleBlock } from './engine.js';
import { buildPiArgs, parseUsage } from './execution.js';
import { rolelessSteps as _rolelessSteps } from './roleless.js';
import { buildRolelessProbes } from './roleless-probes.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const MANIFEST_PATH_DEFAULT = join(__dir, '..', '.claude', 'workflow.md');

const BLOCKER_EXIT = 2;
const SUCCESS_EXIT = 0;

const PLACEHOLDER_GATES_PHASE = '<gates.phase>';
const PLACEHOLDER_VALIDATION_GATE = '<validation gate>';
const LITERAL_PRE_PR_GATE = 'pr.pre-pr-gate';

const SUBSTITUTIONS = Object.freeze({
  [PLACEHOLDER_GATES_PHASE]: (manifest) => manifest?.gates?.phase ?? '',
  [PLACEHOLDER_VALIDATION_GATE]: (manifest) => manifest?.gates?.phase ?? '',
  [LITERAL_PRE_PR_GATE]: (manifest) => manifest?.pr?.['pre-pr-gate'] ?? '',
});

/**
 * Resolve the engine's literal gate placeholder into the real command
 * by reading the committed manifest.
 *
 * Sources the gate from a pre-looked-up gateDecisions entry.
 * This is the orchestrator's substitution replication (DC-G).
 *
 * @param {{ phaseId: string, gate: string, codeProducing: boolean } | undefined} decision The gateDecisions entry for this phase.
 * @param {object} manifest Parsed committed manifest object.
 * @returns {string} The resolved gate command, or '' when unresolvable.
 */
export function resolveGateCommand(decision, manifest) {
  const raw = decision?.gate ?? '';
  const substitution = SUBSTITUTIONS[raw];

  if (substitution !== undefined) {
    return substitution(manifest);
  }

  return raw;
}

/**
 * Classify whether a resolved gate on a code-producing phase is a floor violation.
 * A floor violation means the committed manifest is missing the required gate command.
 *
 * @param {string} resolvedCommand The result of resolveGateCommand.
 * @param {{ codeProducing: boolean }} decision The gateDecisions entry for the phase.
 * @returns {boolean} True when the phase is code-producing and the resolved command is empty.
 */
export function isFloorViolation(resolvedCommand, decision) {
  return decision.codeProducing === true && resolvedCommand === '';
}

/**
 * Shared Promise/blocker wrapper for execFile-based subprocess runners.
 * Mirrors engine.js's private run() — non-zero exit rejects with a blocker error.
 *
 * @param {string} file
 * @param {string[]} args - argv array; never a shell string
 * @param {object} options - execFile options
 * @param {string} unit - blocker unit label for rejection message
 * @param {Function} execFileFn - injectable execFile for testing
 * @returns {Promise<string>} resolves stdout on success
 */
function runSubprocess(file, args, options, unit, execFileFn) {
  return new Promise((resolve, reject) => {
    const child = execFileFn(file, args, options, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr.trim() || err.message;
        reject(new Error(`{ unit: ${unit}, reason: ${detail} }`));
        return;
      }
      resolve(stdout);
    });
    child.stdin.end();
  });
}

/**
 * Spawn a pi subprocess. The ONE place `pi` is launched.
 *
 * Pinned discipline:
 * - stdin is closed by ending the child's stdin stream — execFile accepts no stdio
 *   option that closes stdin for us, so the stream must be ended explicitly or pi
 *   hangs on an open stdin pipe in -p mode
 * - argv array, never a shell string
 * - non-zero exit rejects with { unit: pi-run, reason: <stderr> } blocker
 * - DC-3: does NOT add --model/--provider to argv
 *
 * @param {string[]} argv - argv array built by buildPiArgs
 * @param {{ cwd: string, env?: object }} opts
 * @param {Function} [execFileFn] - injectable execFile for testing; defaults to node:child_process execFile
 * @returns {Promise<string>} resolves stdout on success
 */
export function spawnPi(argv, opts, execFileFn = _execFile) {
  const options = {
    cwd: opts.cwd,
    env: opts.env,
    encoding: 'utf8',
  };
  return runSubprocess('pi', argv, options, 'pi-run', execFileFn);
}

/**
 * Run a resolved gate command as a subprocess (the production never-commit-on-red runner).
 *
 * Splits the command string into file + args for execFile (no shell, no shell:true).
 * Non-zero exit rejects with { unit: gate, reason } blocker.
 *
 * @param {string} command - resolved gate command string, e.g. "node --test"
 * @param {{ cwd: string }} opts
 * @param {Function} [execFileFn] - injectable execFile for testing; defaults to node:child_process execFile
 * @returns {Promise<string>} resolves stdout on success
 */
export function runGate(command, opts, execFileFn = _execFile) {
  const [file, ...args] = command.split(/\s+/);
  const options = { cwd: opts.cwd, encoding: 'utf8' };
  return runSubprocess(file, args, options, 'gate', execFileFn);
}

// Phases that carry a `role` (worker phases — Pi is spawned).
const WORKER_PHASE_IDS = new Set([
  'design', 'planning', 'implementation', 'review', 'refactoring', 'validation', 'documentation',
]);

// Harness phase whose gate guards the propose step (not a commit gate — validation is non-codeProducing).
const VALIDATION_ID = 'validation';
const PROPOSE_ID = 'propose';

/**
 * Default loadManifest: reads and parses the committed manifest file.
 *
 * @param {string} manifestPath
 * @returns {object} Parsed manifest object.
 */
function _loadManifest(manifestPath) {
  const content = readFileSync(manifestPath, 'utf8');
  return parseManifestContent(content) ?? {};
}

/**
 * Run a single worker phase: assemble block, resolve gate, spawn Pi, gate-before-commit.
 *
 * @returns {Promise<{ code: number, record: object }>}
 */
async function runWorkerPhase(phase, resolution, manifest, manifestPath, deps, cwd) {
  const block = await deps.assembleBlock(phase.id, manifestPath);
  const decision = resolution.gateDecisions.find((d) => d.phaseId === phase.id);
  const gateCmd = resolveGateCommand(decision, manifest);

  if (isFloorViolation(gateCmd, decision ?? {})) {
    throw new Error(
      `{ unit: gate, reason: code-producing phase ${phase.id} has no resolvable gate — supply gates.phase in the committed manifest }`,
    );
  }

  const dynamics = { phaseId: phase.id, model: phase.model, gate: gateCmd };
  const argv = buildPiArgs(block, dynamics, { jsonMode: true });
  const stdout = await deps.spawnPi(argv, { cwd, env: deps.env });
  const usage = parseUsage(stdout);

  if (decision?.codeProducing) {
    await deps.runGate(gateCmd, { cwd });
  }

  return { code: SUCCESS_EXIT, record: { phaseId: phase.id, model: phase.model, gateCmd, usage }, gateCmd };
}

/**
 * Build the dep bag for a role-less step from the wired probes.
 * Steps that take no deps (decisions, integrate) receive an empty object.
 *
 * @param {string} phaseId
 * @param {object} probes - the wired rolelessProbes object
 * @returns {object}
 */
function buildRolelessDepBag(phaseId, probes) {
  if (phaseId === 'workspace') {
    return { gitProbe: probes.gitProbe };
  }
  // EQUIVALENT-MUTANT: `if (true)` in place of `if (phaseId === 'propose')` — `decisions()`
  // and `integrate()` both ignore their dep bag entirely, so receiving propose deps instead
  // of {} has no observable effect. (workspace is already returned early above.)
  if (phaseId === 'propose') {
    return {
      hasRemote: probes.hasRemote,
      ghAvailable: probes.ghAvailable,
      ghAuthed: probes.ghAuthed,
      gitPush: probes.gitPush,
      ghPrCreate: probes.ghPrCreate,
    };
  }
  return {};
}

/**
 * Run a single role-less phase via its headless step.
 *
 * @returns {Promise<{ code: number, record: object }>}
 */
async function runRolelessPhase(phase, deps) {
  const stepDeps = buildRolelessDepBag(phase.id, deps.rolelessProbes);
  const stepResult = await deps.rolelessSteps[phase.id](stepDeps);
  if (!stepResult.ok) {
    throw new Error(`{ unit: ${phase.id}, reason: ${stepResult.blocker?.reason ?? 'step blocked'} }`);
  }
  return { code: SUCCESS_EXIT, record: { phaseId: phase.id, outcome: stepResult.record } };
}

/**
 * Wire injected deps with production defaults (DI seam for testing).
 * Falls back to process.env / process.cwd() when callers omit env/cwd;
 * cli.js supplies them explicitly so the production binary never reads
 * process.* at call-time.
 *
 * @param {object} deps
 * @returns {object}
 */
function wireDefaults(deps) {
  const cwd = deps.cwd ?? process.cwd();
  return {
    resolvePipeline:  deps.resolvePipeline  ?? _resolvePipeline,
    assembleBlock:    deps.assembleBlock    ?? _assembleBlock,
    spawnPi:          deps.spawnPi          ?? spawnPi,
    runGate:          deps.runGate          ?? runGate,
    loadManifest:     deps.loadManifest     ?? _loadManifest,
    rolelessSteps:    deps.rolelessSteps    ?? _rolelessSteps,
    // EQUIVALENT-MUTANT: buildRolelessProbes({}) vs buildRolelessProbes({ cwd }) — only observable
    // when the production fallback probes are actually invoked; all test paths inject rolelessProbes
    // directly so the probe's cwd parameter is never read in any test context.
    rolelessProbes:   deps.rolelessProbes   ?? buildRolelessProbes({ cwd }),
    env:              deps.env              ?? process.env,
    cwd,
  };
}

/**
 * Walk one phase: worker (has role) or role-less.
 * Returns the phase record or throws a blocker error.
 *
 * @returns {Promise<{ record: object, gateCmd?: string }>}
 */
async function walkPhase(phase, resolution, manifest, manifestPath, d, validationGateCmd) {
  if (WORKER_PHASE_IDS.has(phase.id)) {
    return runWorkerPhase(phase, resolution, manifest, manifestPath, d, d.cwd);
  }
  if (phase.id === PROPOSE_ID && validationGateCmd) {
    await d.runGate(validationGateCmd, { cwd: d.cwd });
  }
  return runRolelessPhase(phase, d);
}

/**
 * Main entrypoint for the full 11-phase walk.
 *
 * @param {string[]} _argv - CLI arguments (reserved for future use)
 * @param {{ stdout: object, stderr: object }} io
 * @param {object} [deps] - Injected dependencies (DI seam; defaults wire real implementations)
 * @returns {Promise<{ code: number, runRecord: object[] }>}
 */
export async function main(_argv, io, deps = {}) {
  const d = wireDefaults(deps);
  const manifest = d.loadManifest(MANIFEST_PATH_DEFAULT);
  const resolution = await d.resolvePipeline(MANIFEST_PATH_DEFAULT);

  if (!resolution.ok) {
    io.stderr.write(String(resolution.errors));
    return { code: BLOCKER_EXIT, runRecord: [] };
  }

  // EQUIVALENT-MUTANT: `validationGateCmd = "Stryker was here!"` — the propose phase always
  // follows the validation phase in the pipeline; by the time propose is reached, validationGateCmd
  // has been overwritten by the validation phase result, so the initial value is never observed.
  let validationGateCmd = '';
  const runRecord = [];

  for (const phase of resolution.effective) {
    try {
      const phaseResult = await walkPhase(phase, resolution, manifest, MANIFEST_PATH_DEFAULT, d, validationGateCmd);
      runRecord.push(phaseResult.record);
      if (phase.id === VALIDATION_ID) validationGateCmd = phaseResult.gateCmd ?? '';
    } catch (err) {
      io.stderr.write(String(err.message));
      return { code: BLOCKER_EXIT, runRecord };
    }
  }

  return { code: SUCCESS_EXIT, runRecord };
}
