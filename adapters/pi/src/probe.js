/**
 * Acceptance-probe runner for the Pi adapter.
 *
 * Drives the shared engine probe harness with Pi's own runner, version
 * key, and port list.
 */

import { runProbeHarness } from '../../../engine/src/probe-harness.js';

const PORTS_EXERCISED = Object.freeze(['Execution', 'Model', 'Gate', 'VCS']);

/**
 * Run the acceptance probe for one construction-bearing phase.
 *
 * @param {{ piRunner: Function, fsOps: { mktemp: () => Promise<string> } }} deps
 * @returns {Promise<{ passed: boolean, evidence: object }>}
 */
export async function runAcceptanceProbe({ piRunner, fsOps }) {
  return runProbeHarness({
    runner: piRunner,
    fsOps,
    versionKey: 'piVersion',
    portsExercised: PORTS_EXERCISED,
  });
}
