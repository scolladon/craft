import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAcceptanceProbe } from '../src/probe.js';

const THROWAWAY_PATH = '/tmp/codex-probe-throwaway-abc123';
const EXTERNAL_PATH = '/some/other/dir/file.js';

function makeFsOps(throwawayPath) {
  return {
    mktemp: async () => throwawayPath,
  };
}

const GREEN_TRACE = {
  gateOutcome: 'green',
  gateRanBeforeCommit: true,
  committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
  mutatedPaths: [
    `${THROWAWAY_PATH}/src/feature.js`,
    `${THROWAWAY_PATH}/test/feature.test.js`,
  ],
  phases: [{ id: 'implementation', outcome: 'RED→GREEN→commit' }],
  codexVersion: '0.144.6',
  model: 'gpt-5.6-terra',
};

const COMMIT_ON_RED_TRACE = {
  gateOutcome: 'red',
  gateRanBeforeCommit: false,
  committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
  mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
  phases: [{ id: 'implementation', outcome: 'commit-on-red' }],
  codexVersion: '0.144.6',
  model: 'gpt-5.6-terra',
};

const MISSING_ARTIFACT_TRACE = {
  gateOutcome: 'green',
  gateRanBeforeCommit: true,
  committedArtifact: null,
  mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
  phases: [{ id: 'implementation', outcome: 'no-commit' }],
  codexVersion: '0.144.6',
  model: 'gpt-5.6-terra',
};

const ESCAPED_MUTATION_TRACE = {
  gateOutcome: 'green',
  gateRanBeforeCommit: true,
  committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
  mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`, EXTERNAL_PATH],
  phases: [{ id: 'implementation', outcome: 'RED→GREEN→commit' }],
  codexVersion: '0.144.6',
  model: 'gpt-5.6-terra',
};

describe('runAcceptanceProbe() — happy path (green trace)', () => {
  it('Given a green run-trace with gate-before-commit and mutations inside the throwaway, when probe runs, then passed is true', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const codexRunner = async () => GREEN_TRACE;

    const result = await sut({ codexRunner, fsOps });

    assert.equal(result.passed, true);
  });

  it('Given a green run-trace, when probe runs, then evidence carries the expected keys', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const codexRunner = async () => GREEN_TRACE;

    const result = await sut({ codexRunner, fsOps });

    const REQUIRED_KEYS = ['targetPath', 'codexVersion', 'model', 'portsExercised', 'phases'];
    for (const key of REQUIRED_KEYS) {
      assert.ok(Object.hasOwn(result.evidence, key), `evidence missing key: ${key}`);
    }
  });

  it('Given a green run-trace, when probe runs, then portsExercised lists exactly Execution, Model, Gate', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const codexRunner = async () => GREEN_TRACE;

    const result = await sut({ codexRunner, fsOps });

    assert.deepEqual(result.evidence.portsExercised, ['Execution', 'Model', 'Gate']);
  });
});

describe('runAcceptanceProbe() — never-commit-on-red structural assertion', () => {
  it('Given a run-trace where commit happened on a red gate, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const codexRunner = async () => COMMIT_ON_RED_TRACE;

    const result = await sut({ codexRunner, fsOps });

    assert.equal(result.passed, false);
  });
});

describe('runAcceptanceProbe() — committed-artifact structural assertion', () => {
  it('Given a run-trace with no committed artifact, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const codexRunner = async () => MISSING_ARTIFACT_TRACE;

    const result = await sut({ codexRunner, fsOps });

    assert.equal(result.passed, false);
  });
});

describe('runAcceptanceProbe() — mutations-inside-throwaway structural assertion', () => {
  it('Given a run-trace with a mutation outside the throwaway path, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const codexRunner = async () => ESCAPED_MUTATION_TRACE;

    const result = await sut({ codexRunner, fsOps });

    assert.equal(result.passed, false);
  });
});

describe('runAcceptanceProbe() — launch-args wiring (posture, never containment claim)', () => {
  it('Given the probe runs, when codexRunner is called, then launchArgs never contains --ephemeral', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const codexRunner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ codexRunner, fsOps });

    assert.ok(!capturedArgs.launchArgs.includes('--ephemeral'));
  });

  it('Given the probe runs, when codexRunner is called, then launchArgs never contains danger-full-access', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const codexRunner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ codexRunner, fsOps });

    assert.ok(!capturedArgs.launchArgs.includes('danger-full-access'));
  });

  it('Given the probe runs, when codexRunner is called, then launchArgs carries -C immediately followed by the throwaway path', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const codexRunner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ codexRunner, fsOps });

    const idx = capturedArgs.launchArgs.indexOf('-C');
    assert.notEqual(idx, -1);
    assert.equal(capturedArgs.launchArgs[idx + 1], THROWAWAY_PATH);
  });
});

describe('runAcceptanceProbe() — codexRunner receives the correct invocation arguments', () => {
  it('Given the probe runs, when codexRunner is called, then it receives workingDir matching the throwaway path', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const codexRunner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ codexRunner, fsOps });

    assert.equal(capturedArgs.workingDir, THROWAWAY_PATH);
  });

  it('Given the probe runs, when codexRunner is called, then it receives a phaseId', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const codexRunner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ codexRunner, fsOps });

    assert.ok(capturedArgs.phaseId && capturedArgs.phaseId.length > 0);
  });

  it('Given the probe runs, when codexRunner is called, then it receives a modelTier', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const codexRunner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ codexRunner, fsOps });

    assert.ok(capturedArgs.modelTier && capturedArgs.modelTier.length > 0);
  });
});

describe('runAcceptanceProbe() — evidence shape and contents', () => {
  it('Given a green run-trace, when probe runs, then evidence.targetPath equals the throwaway path returned by fsOps.mktemp', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const codexRunner = async () => GREEN_TRACE;

    const result = await sut({ codexRunner, fsOps });

    assert.equal(result.evidence.targetPath, THROWAWAY_PATH);
  });

  it('Given a green run-trace, when probe runs, then evidence.codexVersion matches the trace codexVersion', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const codexRunner = async () => GREEN_TRACE;

    const result = await sut({ codexRunner, fsOps });

    assert.equal(result.evidence.codexVersion, GREEN_TRACE.codexVersion);
  });

  it('Given a green run-trace, when probe runs, then evidence.portsExercised is a new array (not the frozen source)', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const codexRunner = async () => GREEN_TRACE;

    const result = await sut({ codexRunner, fsOps });

    assert.equal(Object.isFrozen(result.evidence.portsExercised), false);
  });

  it('Given a run-trace with phases undefined, when probe runs, then evidence.phases is an empty array', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const trace = { ...GREEN_TRACE, phases: undefined };
    const codexRunner = async () => trace;

    const result = await sut({ codexRunner, fsOps });

    assert.deepEqual(result.evidence.phases, []);
  });
});
