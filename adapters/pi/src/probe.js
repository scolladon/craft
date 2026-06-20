/**
 * Acceptance-probe runner for the Pi adapter.
 *
 * Drives ONE construction-bearing phase end-to-end through the Pi adapter
 * using injected piRunner / fsOps so all structural assertions are
 * unit-testable without a live Pi session.
 *
 * Safety (state-mutating-probe rule): the entire probe runs inside a
 * mktemp throwaway repo — Pi's tool_call / exec surface and any
 * commit / git verb mutate only that throwaway, never the worktree.
 */

const PHASE_ID = 'implementation';
const MODEL_TIER = 'sonnet';

const PORTS_EXERCISED = Object.freeze(['Execution', 'Model', 'Gate', 'VCS']);

/**
 * Assert that every mutation recorded by the run-trace stayed inside
 * the throwaway directory.
 *
 * @param {string[]} mutatedPaths
 * @param {string} throwawayPath
 * @returns {boolean}
 */
function assertMutationsInsideThrowaway(mutatedPaths, throwawayPath) {
  const prefix = throwawayPath.endsWith('/') ? throwawayPath : `${throwawayPath}/`;
  return mutatedPaths.every(
    (p) => p === throwawayPath || p.startsWith(prefix),
  );
}

/**
 * Assert that the gate ran and was GREEN before the commit happened.
 * A RED gate outcome or a gate that did not run before commit violates
 * the never-commit-on-red rule.
 *
 * @param {{ gateOutcome: string, gateRanBeforeCommit: boolean }} trace
 * @returns {boolean}
 */
function assertGateGreenBeforeCommit(trace) {
  return trace.gateOutcome === 'green' && trace.gateRanBeforeCommit === true;
}

/**
 * Assert that the run-trace contains a committed artifact (the handoff).
 *
 * @param {{ committedArtifact: string|null|undefined }} trace
 * @returns {boolean}
 */
function assertCommittedArtifact(trace) {
  return typeof trace.committedArtifact === 'string' && trace.committedArtifact.length > 0;
}

/**
 * Evaluate all structural assertions against the run-trace.
 * Returns true only when every assertion holds.
 *
 * @param {object} trace
 * @param {string} throwawayPath
 * @returns {boolean}
 */
function evaluateTrace(trace, throwawayPath) {
  if (!assertGateGreenBeforeCommit(trace)) return false;
  if (!assertCommittedArtifact(trace)) return false;
  if (!assertMutationsInsideThrowaway(trace.mutatedPaths ?? [], throwawayPath)) return false;
  return true;
}

/**
 * Build the evidence object returned to the caller (and recorded by slice 7).
 *
 * @param {object} trace
 * @param {string} targetPath
 * @returns {object}
 */
function buildEvidence(trace, targetPath) {
  return {
    targetPath,
    piVersion: trace.piVersion,
    model: trace.model,
    portsExercised: PORTS_EXERCISED.slice(),
    phases: trace.phases ?? [],
  };
}

/**
 * Run the acceptance probe for one construction-bearing phase.
 *
 * @param {{ piRunner: Function, fsOps: { mktemp: () => Promise<string> } }} deps
 * @returns {Promise<{ passed: boolean, evidence: object }>}
 */
export async function runAcceptanceProbe({ piRunner, fsOps }) {
  const targetPath = await fsOps.mktemp();

  const trace = await piRunner({
    phaseId: PHASE_ID,
    modelTier: MODEL_TIER,
    workingDir: targetPath,
  });

  const passed = evaluateTrace(trace, targetPath);
  const evidence = buildEvidence(trace, targetPath);

  return { passed, evidence };
}
