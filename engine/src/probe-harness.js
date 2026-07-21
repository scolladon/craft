/**
 * Shared acceptance-probe harness.
 *
 * Drives ONE construction-bearing phase end-to-end through an injected
 * runner / fsOps so all structural assertions are unit-testable without a
 * live CLI session — no test here, or in any binding's wrapper, spawns a
 * real CLI process.
 *
 * Safety (state-mutating-probe rule): the entire probe runs inside a mktemp
 * throwaway repo; each binding's own `extraRunnerArgs` may carry the launch
 * argv that scopes a real session's sandbox and containment root to that
 * throwaway, never the caller's worktree.
 */

const PHASE_ID = 'implementation';
const MODEL_TIER = 'sonnet';

/**
 * Assert that every path the run-trace recorded as written stayed inside
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
 * Run the acceptance probe for one construction-bearing phase.
 *
 * @param {{
 *   runner: Function,
 *   fsOps: { mktemp: () => Promise<string> },
 *   versionKey: string,
 *   portsExercised: string[],
 *   extraRunnerArgs?: (targetPath: string) => object,
 * }} deps
 * @returns {Promise<{ passed: boolean, evidence: object }>}
 */
export async function runProbeHarness({ runner, fsOps, versionKey, portsExercised, extraRunnerArgs = () => ({}) }) {
  const targetPath = await fsOps.mktemp();

  const trace = await runner({
    phaseId: PHASE_ID,
    modelTier: MODEL_TIER,
    workingDir: targetPath,
    ...extraRunnerArgs(targetPath),
  });

  const passed = evaluateTrace(trace, targetPath);
  const evidence = {
    targetPath,
    [versionKey]: trace[versionKey],
    model: trace.model,
    portsExercised: portsExercised.slice(),
    phases: trace.phases ?? [],
  };

  return { passed, evidence };
}
