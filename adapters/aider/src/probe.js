/**
 * Acceptance-probe runner for the Aider adapter.
 *
 * Drives the shared engine probe harness with aider's own runner, version key, port
 * list, and launch-arg posture. Four ports are exercised — Execution, Model, Gate, VCS —
 * VCS is first-class here because Aider's own auto-commit is the handoff artifact. No
 * test spawns a real `aider` process: the runner is injected, and the whole probe runs
 * inside a mktemp throwaway. Aider has no workspace flag, so unlike cursor the launch
 * argv carries no target-path token — the runner scopes the session via spawn cwd.
 */

import { runProbeHarness } from '../../../engine/src/probe-harness.js';
import { buildLaunchArgs } from './launch-args.js';
import { resolveAiderModel } from './model-tier-map.js';
import { buildVcsPostureArgs } from './vcs-posture.js';

const PORTS_EXERCISED = Object.freeze(['Execution', 'Model', 'Gate', 'VCS']);

// The shared harness drives its construction phase at the sonnet tier; resolve that
// same tier to a concrete Aider model id so the launch argv the probe emits is the
// real one a sonnet-tier phase would run under.
const PROBE_TIER = 'sonnet';

/**
 * Run the acceptance probe for one construction-bearing phase.
 *
 * @param {{ aiderRunner: Function, fsOps: { mktemp: () => Promise<string> } }} deps
 * @returns {Promise<{ passed: boolean, evidence: object }>}
 */
export async function runAcceptanceProbe({ aiderRunner, fsOps }) {
  return runProbeHarness({
    runner: aiderRunner,
    fsOps,
    versionKey: 'aiderVersion',
    portsExercised: PORTS_EXERCISED,
    extraRunnerArgs: () => ({
      launchArgs: [
        ...buildLaunchArgs({ model: resolveAiderModel(PROBE_TIER), readFiles: [], message: 'probe: construct' }),
        ...buildVcsPostureArgs(),
      ],
    }),
  });
}
