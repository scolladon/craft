/**
 * Launch-args posture for the `cursor-agent -p` subprocess (one craft phase = one
 * headless turn).
 *
 * Every flag is a deliberate posture choice pinned against the live `--help`:
 *   - `-p --output-format json` is the machine-readable one-turn-and-exit port.
 *   - `--model <id>` carries the per-role tier (Cursor bakes effort into the id).
 *   - `--workspace <dir>` scopes the turn to the caller-verified working dir; emitted
 *     as two discrete argv elements (flag, then value) — never one interpolated string.
 *   - `--force` provides NON-INTERACTIVITY (a `-p` turn otherwise blocks on the approval
 *     prompt with no TTY). It is NOT a safety claim: the enforcing `beforeShellExecution`
 *     guard is the safety layer and denies even under `--force` (measured live). Sandbox
 *     containment is a SEPARATE, opt-in `--sandbox` mode whose per-mode blocking is
 *     measured against this binding (see the PoC / README) — never assumed here.
 */
import { isAbsolute } from 'node:path';

const FLAG_PRINT = '-p';
const FLAG_OUTPUT_FORMAT = '--output-format';
const OUTPUT_FORMAT_JSON = 'json';
const FLAG_MODEL = '--model';
const FLAG_WORKSPACE = '--workspace';
const FLAG_FORCE = '--force';
const FLAG_SANDBOX = '--sandbox';
const SANDBOX_MODES = new Set(['enabled', 'disabled']);

/**
 * `workingDir` doubles as the containment root the sandbox and workspace both reason
 * about. An absent, empty, or relative value would let `--workspace` resolve against the
 * CLI's own cwd instead of a caller-verified root, so it is rejected rather than forwarded.
 * @param {string} workingDir
 */
function assertAbsoluteWorkingDir(workingDir) {
  if (typeof workingDir !== 'string' || workingDir === '' || !isAbsolute(workingDir)) {
    throw new Error(
      `buildLaunchArgs: workingDir "${workingDir}" must be a non-empty absolute path — refusing to emit an unbounded workspace root`,
    );
  }
}

/**
 * A tier that resolved to no model must never be forwarded as an empty `--model` value
 * (Cursor would fall back silently to the account default, changing which model ran).
 * @param {string} model
 */
function assertModel(model) {
  if (typeof model !== 'string' || model === '') {
    throw new Error('buildLaunchArgs: model must be a non-empty string (resolve the tier first)');
  }
}

/**
 * Build the argv array for a `cursor-agent -p` subprocess invocation.
 *
 * @param {{ workingDir: string, model: string, sandbox?: 'enabled'|'disabled' }} opts
 * @returns {string[]} argv suitable for execFile('cursor-agent', [...args, prompt])
 */
export function buildLaunchArgs({ workingDir, model, sandbox }) {
  assertAbsoluteWorkingDir(workingDir);
  assertModel(model);

  const args = [
    FLAG_PRINT,
    FLAG_OUTPUT_FORMAT,
    OUTPUT_FORMAT_JSON,
    FLAG_MODEL,
    model,
    FLAG_WORKSPACE,
    workingDir,
    FLAG_FORCE,
  ];

  // Sandbox is opt-in and explicit. A value outside the pinned set is a caller error,
  // not a silent pass — an unrecognised mode must never be forwarded as if valid.
  if (sandbox !== undefined) {
    if (!SANDBOX_MODES.has(sandbox)) {
      throw new Error(`buildLaunchArgs: sandbox "${sandbox}" must be one of enabled|disabled`);
    }
    args.push(FLAG_SANDBOX, sandbox);
  }

  return args;
}
