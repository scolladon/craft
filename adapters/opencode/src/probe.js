/**
 * Acceptance-probe runner for the opencode adapter.
 *
 * Drives the shared engine probe harness with opencode's own runner,
 * version key, and port list.
 */

import { runProbeHarness } from '../../../engine/src/probe-harness.js';

const PORTS_EXERCISED = Object.freeze(['Execution', 'Model', 'Gate', 'VCS']);

/**
 * Run the acceptance probe for one construction-bearing phase.
 *
 * @param {{ opencodeRunner: Function, fsOps: { mktemp: () => Promise<string> } }} deps
 * @returns {Promise<{ passed: boolean, evidence: object }>}
 */
export async function runAcceptanceProbe({ opencodeRunner, fsOps }) {
  return runProbeHarness({
    runner: opencodeRunner,
    fsOps,
    versionKey: 'opencodeVersion',
    portsExercised: PORTS_EXERCISED,
  });
}
