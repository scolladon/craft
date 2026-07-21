/**
 * Launch-args posture for the `codex exec` subprocess.
 *
 * Every flag here is a deliberate posture choice, not a default. In
 * particular:
 *   - Sandbox mode is always explicit, never left to the CLI default.
 *     Selecting `workspace-write` is NOT a containment claim — per-mode
 *     blocking was never measured against this binding, so this module
 *     documents a posture, not a guarantee.
 *   - the full-access sandbox mode is never emitted, on any code path.
 *   - `-C <workingDir>` is emitted as two discrete argv elements (flag, then
 *     value) — never one interpolated string. Same argv-array discipline as
 *     `adapters/pi/src/execution.js`.
 */

import { isAbsolute } from 'node:path';

const FLAG_SANDBOX = '-s';
const SANDBOX_WORKSPACE_WRITE = 'workspace-write';
const FLAG_WORKING_DIR = '-C';
const FLAG_BYPASS_HOOK_TRUST = '--dangerously-bypass-hook-trust';

/**
 * `workingDir` doubles as the containment root the guard hook and the
 * sandbox both reason about. An absent, empty, or relative value would let
 * `-C` resolve against the CLI's own cwd instead of a caller-verified root,
 * so it is rejected here rather than forwarded.
 *
 * @param {string} workingDir
 */
function assertAbsoluteWorkingDir(workingDir) {
  if (typeof workingDir !== 'string' || workingDir === '' || !isAbsolute(workingDir)) {
    throw new Error(
      `buildLaunchArgs: workingDir "${workingDir}" must be a non-empty absolute path — refusing to emit an unbounded containment root`,
    );
  }
}

/**
 * Build the argv array for a `codex exec` subprocess invocation.
 *
 * @param {{ workingDir: string }} opts
 * @returns {string[]} argv array suitable for execFile('codex', ['exec', ...args, prompt])
 */
export function buildLaunchArgs({ workingDir, bypassHookTrust = false }) {
  assertAbsoluteWorkingDir(workingDir);

  const args = [
    FLAG_SANDBOX,
    SANDBOX_WORKSPACE_WRITE,
    FLAG_WORKING_DIR,
    workingDir,
    // `--ephemeral` is deliberately never emitted: it suppresses the session
    // files `--source codex` telemetry mines, turning telemetry into a silent
    // zero that reads as success. Do not add it "for hygiene".
  ];

  // `--dangerously-bypass-hook-trust` is OPT-IN and defaults OFF.
  //
  // The flag is not scoped to this binding's own hook — it disables the trust
  // gate for EVERY hook in the invoking environment. Emitting it by default
  // would mean installing craft silently downgrades an unrelated security
  // control, which no amount of guard strength justifies.
  //
  // The intended path is instead a one-time trust of the craft guard hook at
  // install time; see the binding README.
  //
  // Open question, deliberately not assumed either way: whether an *untrusted*
  // hook in headless mode fails loudly or silently no-ops. If it silently
  // no-ops, the guard is absent while appearing installed — the worst outcome.
  // Until that is pinned live, callers that need the bypass must ask for it
  // explicitly and knowingly.
  if (bypassHookTrust) {
    args.push(FLAG_BYPASS_HOOK_TRUST);
  }

  return args;
}
