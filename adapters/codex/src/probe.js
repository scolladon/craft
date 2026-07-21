/**
 * Acceptance-probe runner for the Codex adapter.
 *
 * Drives the shared engine probe harness with codex's own runner, version
 * key, port list, and launch-arg posture. Only three ports are exercised,
 * deliberately fewer than copilot's four: this binding binds no VCS port.
 */

import { runProbeHarness } from '../../../engine/src/probe-harness.js';
import { buildLaunchArgs } from './launch-args.js';

const PORTS_EXERCISED = Object.freeze(['Execution', 'Model', 'Gate']);

/**
 * Run the acceptance probe for one construction-bearing phase.
 *
 * @param {{ codexRunner: Function, fsOps: { mktemp: () => Promise<string> } }} deps
 * @returns {Promise<{ passed: boolean, evidence: object }>}
 */
export async function runAcceptanceProbe({ codexRunner, fsOps }) {
  return runProbeHarness({
    runner: codexRunner,
    fsOps,
    versionKey: 'codexVersion',
    portsExercised: PORTS_EXERCISED,
    extraRunnerArgs: (targetPath) => ({ launchArgs: buildLaunchArgs({ workingDir: targetPath }) }),
  });
}
