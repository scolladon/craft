import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runProbeHarness } from '../src/probe-harness.js';

const THROWAWAY_PATH = '/tmp/probe-harness-throwaway-abc123';
const EXTERNAL_PATH = '/some/other/dir/file.js';

/**
 * Build a fake fsOps that returns the given throwaway path.
 */
function makeFsOps(throwawayPath) {
  return {
    mktemp: async () => throwawayPath,
  };
}

/**
 * A canned run-trace representing a successful RED→GREEN→commit cycle
 * with the gate green before the commit and all mutations inside the throwaway.
 */
const GREEN_TRACE = {
  gateOutcome: 'green',
  gateRanBeforeCommit: true,
  committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
  mutatedPaths: [
    `${THROWAWAY_PATH}/src/feature.js`,
    `${THROWAWAY_PATH}/test/feature.test.js`,
  ],
  phases: [{ id: 'implementation', outcome: 'RED→GREEN→commit' }],
  fakeVersion: '1.2.3',
  model: 'sonnet',
};

const COMMIT_ON_RED_TRACE = {
  ...GREEN_TRACE,
  gateOutcome: 'red',
  gateRanBeforeCommit: false,
};

const MISSING_ARTIFACT_TRACE = {
  ...GREEN_TRACE,
  committedArtifact: null,
};

const ESCAPED_MUTATION_TRACE = {
  ...GREEN_TRACE,
  mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`, EXTERNAL_PATH],
};

const FROZEN_PORTS = Object.freeze(['Execution', 'Model', 'Gate']);

describe('runProbeHarness() — extraRunnerArgs merging', () => {
  it('Given an extraRunnerArgs function, when the harness runs, then its return value is merged into the runner call', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const runner = async (args) => { capturedArgs = args; return GREEN_TRACE; };
    const extraRunnerArgs = (targetPath) => ({ launchArgs: [`-C`, targetPath] });

    await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS, extraRunnerArgs });

    assert.deepEqual(capturedArgs.launchArgs, ['-C', THROWAWAY_PATH]);
  });

  it('Given no extraRunnerArgs is supplied, when the harness runs, then the runner call carries no extra key', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const runner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.deepEqual(Object.keys(capturedArgs).sort(), ['modelTier', 'phaseId', 'workingDir']);
  });

  it('Given the harness runs, when the runner is called, then it receives phaseId, modelTier, and workingDir', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const runner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(capturedArgs.phaseId, 'implementation');
    assert.equal(capturedArgs.modelTier, 'sonnet');
    assert.equal(capturedArgs.workingDir, THROWAWAY_PATH);
  });
});

describe('runProbeHarness() — versionKey read dynamically', () => {
  it('Given a versionKey, when the harness runs, then evidence carries the trace value under that key', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => GREEN_TRACE;

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.evidence.fakeVersion, GREEN_TRACE.fakeVersion);
  });
});

describe('runProbeHarness() — portsExercised is a copy', () => {
  it('Given a frozen portsExercised array, when the harness runs, then evidence.portsExercised is not the same frozen array', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => GREEN_TRACE;

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(Object.isFrozen(result.evidence.portsExercised), false);
    assert.notEqual(result.evidence.portsExercised, FROZEN_PORTS);
  });

  it('Given evidence.portsExercised is mutated, when compared to the input array, then the input array is unaffected', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => GREEN_TRACE;

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });
    result.evidence.portsExercised.push('Extra');

    assert.deepEqual(FROZEN_PORTS, ['Execution', 'Model', 'Gate']);
  });
});

describe('runProbeHarness() — structural assertions flip passed false', () => {
  it('Given a run-trace where commit happened on a red gate, when the harness runs, then passed is false', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => COMMIT_ON_RED_TRACE;

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, false);
  });

  it('Given a run-trace with no committed artifact, when the harness runs, then passed is false', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => MISSING_ARTIFACT_TRACE;

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, false);
  });

  it('Given a run-trace with a mutation outside the throwaway path, when the harness runs, then passed is false', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => ESCAPED_MUTATION_TRACE;

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, false);
  });

  it('Given the gate was green but did NOT run before the commit, when the harness runs, then passed is false (both conjuncts required)', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => ({ ...GREEN_TRACE, gateOutcome: 'green', gateRanBeforeCommit: false });

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, false);
  });

  it('Given the gate ran before commit but was not green, when the harness runs, then passed is false (green is required, not merely a run)', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => ({ ...GREEN_TRACE, gateOutcome: 'pending', gateRanBeforeCommit: true });

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, false);
  });

  it('Given a committed artifact that is an empty string, when the harness runs, then passed is false (non-empty required)', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => ({ ...GREEN_TRACE, committedArtifact: '' });

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, false);
  });

  it('Given a mutated path that is a sibling sharing the throwaway prefix but outside it, when the harness runs, then passed is false (containment is by path boundary, not string prefix)', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => ({ ...GREEN_TRACE, mutatedPaths: [`${THROWAWAY_PATH}-sibling/escaped.js`] });

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, false);
  });

  it('Given a mutated path that is exactly the throwaway root, when the harness runs, then it is treated as inside (passed stays true)', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => ({ ...GREEN_TRACE, mutatedPaths: [THROWAWAY_PATH] });

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, true);
  });

  it('Given a trace with no mutatedPaths at all, when the harness runs, then the empty set is vacuously contained (passed stays true)', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => ({ ...GREEN_TRACE, mutatedPaths: undefined });

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, true);
  });
});

describe('runProbeHarness() — happy path', () => {
  it('Given a green run-trace with gate-before-commit and mutations inside the throwaway, when the harness runs, then passed is true', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => GREEN_TRACE;

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.passed, true);
  });

  it('Given a green run-trace, when the harness runs, then evidence carries targetPath, model, and phases', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const runner = async () => GREEN_TRACE;

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.equal(result.evidence.targetPath, THROWAWAY_PATH);
    assert.equal(result.evidence.model, GREEN_TRACE.model);
    assert.deepEqual(result.evidence.phases, GREEN_TRACE.phases);
  });

  it('Given a run-trace with phases undefined, when the harness runs, then evidence.phases is an empty array', async () => {
    const sut = runProbeHarness;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const trace = { ...GREEN_TRACE, phases: undefined };
    const runner = async () => trace;

    const result = await sut({ runner, fsOps, versionKey: 'fakeVersion', portsExercised: FROZEN_PORTS });

    assert.deepEqual(result.evidence.phases, []);
  });
});
