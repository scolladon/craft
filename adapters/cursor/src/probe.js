/**
 * Acceptance-probe runner for the Cursor adapter.
 *
 * Drives the shared engine probe harness with cursor's own runner, version key, port
 * list, and launch-arg posture. Three ports are exercised — Execution, Model, Gate —
 * the same set as codex; this binding binds no VCS port. No test spawns a real
 * cursor-agent process: the runner is injected, and the whole probe runs inside a
 * mktemp throwaway whose path the launch argv scopes the session to.
 */

import { runProbeHarness } from '../../../engine/src/probe-harness.js';
import { buildLaunchArgs } from './launch-args.js';
import { resolveCursorModel } from './model-tier-map.js';

const PORTS_EXERCISED = Object.freeze(['Execution', 'Model', 'Gate']);

// The shared harness drives its construction phase at the sonnet tier; resolve that
// same tier to a concrete Cursor model id so the launch argv the probe emits is the
// real one a sonnet-tier phase would run under.
const PROBE_TIER = 'sonnet';

/**
 * Run the acceptance probe for one construction-bearing phase.
 *
 * @param {{ cursorRunner: Function, fsOps: { mktemp: () => Promise<string> } }} deps
 * @returns {Promise<{ passed: boolean, evidence: object }>}
 */
export async function runAcceptanceProbe({ cursorRunner, fsOps }) {
  return runProbeHarness({
    runner: cursorRunner,
    fsOps,
    versionKey: 'cursorVersion',
    portsExercised: PORTS_EXERCISED,
    extraRunnerArgs: (targetPath) => ({
      launchArgs: buildLaunchArgs({ workingDir: targetPath, model: resolveCursorModel(PROBE_TIER) }),
    }),
  });
}
