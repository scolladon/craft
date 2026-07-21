/**
 * Acceptance-probe runner for the Copilot adapter.
 *
 * Drives the shared engine probe harness with copilot's own runner, version
 * key, port list, and launch-arg posture (the containment argv that makes
 * a real Copilot session mutate only the throwaway).
 */

import { runProbeHarness } from '../../../engine/src/probe-harness.js';
import { buildLaunchArgs } from './deny-tool-args.js';

const PORTS_EXERCISED = Object.freeze(['Execution', 'Model', 'Gate', 'VCS']);

/**
 * Run the acceptance probe for one construction-bearing phase.
 *
 * @param {{ copilotRunner: Function, fsOps: { mktemp: () => Promise<string> } }} deps
 * @returns {Promise<{ passed: boolean, evidence: object }>}
 */
export async function runAcceptanceProbe({ copilotRunner, fsOps }) {
  return runProbeHarness({
    runner: copilotRunner,
    fsOps,
    versionKey: 'copilotVersion',
    portsExercised: PORTS_EXERCISED,
    extraRunnerArgs: (targetPath) => ({ launchArgs: buildLaunchArgs({ workingDir: targetPath }) }),
  });
}
