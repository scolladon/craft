import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAcceptanceProbe } from '../src/probe.js';

const THROWAWAY_PATH = '/tmp/probe-throwaway-abc123';
const EXTERNAL_PATH = '/some/other/dir/file.js';

/**
 * Build a fake fsOps that records calls and returns the given throwaway path.
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
  piVersion: '0.79.8',
  model: 'sonnet',
};

/**
 * A canned run-trace where the commit happened on a RED gate (never-commit-on-red violated).
 */
const COMMIT_ON_RED_TRACE = {
  gateOutcome: 'red',
  gateRanBeforeCommit: false,
  committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
  mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
  phases: [{ id: 'implementation', outcome: 'commit-on-red' }],
  piVersion: '0.79.8',
  model: 'sonnet',
};

/**
 * A canned run-trace where a mutation escaped outside the throwaway directory.
 */
const ESCAPED_MUTATION_TRACE = {
  gateOutcome: 'green',
  gateRanBeforeCommit: true,
  committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
  mutatedPaths: [
    `${THROWAWAY_PATH}/src/feature.js`,
    EXTERNAL_PATH,
  ],
  phases: [{ id: 'implementation', outcome: 'RED→GREEN→commit' }],
  piVersion: '0.79.8',
  model: 'sonnet',
};

/**
 * A canned run-trace with no committed artifact (the handoff is missing).
 */
const MISSING_ARTIFACT_TRACE = {
  gateOutcome: 'green',
  gateRanBeforeCommit: true,
  committedArtifact: null,
  mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
  phases: [{ id: 'implementation', outcome: 'no-commit' }],
  piVersion: '0.79.8',
  model: 'sonnet',
};

/**
 * A canned run-trace where the gate was red but still ran before the commit
 * (isolates the gate-outcome conjunct from the ordering conjunct).
 */
const RED_BEFORE_COMMIT_TRACE = {
  gateOutcome: 'red',
  gateRanBeforeCommit: true,
  committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
  mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
  phases: [{ id: 'implementation', outcome: 'gate-red' }],
  piVersion: '0.79.8',
  model: 'sonnet',
};

/**
 * A canned run-trace where the gate was green but ran after the commit
 * (isolates the ordering conjunct from the gate-outcome conjunct).
 */
const GREEN_AFTER_COMMIT_TRACE = {
  gateOutcome: 'green',
  gateRanBeforeCommit: false,
  committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
  mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
  phases: [{ id: 'implementation', outcome: 'gate-after-commit' }],
  piVersion: '0.79.8',
  model: 'sonnet',
};

describe('runAcceptanceProbe() — happy path (green trace)', () => {
  it('Given a green run-trace with gate-before-commit and mutations inside the throwaway, when probe runs, then passed is true', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, true);
  });

  it('Given a green run-trace, when probe runs, then evidence carries the expected keys', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_TRACE;

    const result = await sut({ piRunner, fsOps });

    const REQUIRED_KEYS = ['targetPath', 'piVersion', 'model', 'portsExercised', 'phases'];
    for (const key of REQUIRED_KEYS) {
      assert.ok(Object.hasOwn(result.evidence, key), `evidence missing key: ${key}`);
    }
  });

  it('Given a green run-trace, when probe runs, then portsExercised lists the four load-bearing ports', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_TRACE;

    const result = await sut({ piRunner, fsOps });

    const EXPECTED_PORTS = ['Execution', 'Model', 'Gate', 'VCS'];
    for (const port of EXPECTED_PORTS) {
      assert.ok(
        result.evidence.portsExercised.includes(port),
        `portsExercised missing port: ${port}`,
      );
    }
  });
});

describe('runAcceptanceProbe() — never-commit-on-red structural assertion', () => {
  it('Given a run-trace where commit happened on a red gate, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => COMMIT_ON_RED_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, false);
  });
});

describe('runAcceptanceProbe() — mutations-inside-throwaway structural assertion', () => {
  it('Given a run-trace with a mutation outside the throwaway path, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => ESCAPED_MUTATION_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, false);
  });
});

describe('runAcceptanceProbe() — committed-artifact structural assertion', () => {
  it('Given a run-trace with no committed artifact, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => MISSING_ARTIFACT_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, false);
  });
});

const SIBLING_EVIL_PATH = THROWAWAY_PATH + '-evil';

describe('runAcceptanceProbe() — piRunner receives the correct invocation arguments', () => {
  it('Given the probe runs, when piRunner is called, then it receives phaseId implementation', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const piRunner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ piRunner, fsOps });

    assert.equal(capturedArgs.phaseId, 'implementation');
  });

  it('Given the probe runs, when piRunner is called, then it receives modelTier sonnet', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const piRunner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ piRunner, fsOps });

    assert.equal(capturedArgs.modelTier, 'sonnet');
  });

  it('Given the probe runs, when piRunner is called, then it receives workingDir matching the throwaway path', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    let capturedArgs;
    const piRunner = async (args) => { capturedArgs = args; return GREEN_TRACE; };

    await sut({ piRunner, fsOps });

    assert.equal(capturedArgs.workingDir, THROWAWAY_PATH);
  });
});

describe('runAcceptanceProbe() — default array fallbacks for optional trace fields', () => {
  it('Given a run-trace with mutatedPaths undefined, when probe runs, then passed is true (no mutations = safe)', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const trace = {
      gateOutcome: 'green',
      gateRanBeforeCommit: true,
      committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
      mutatedPaths: undefined,
      phases: [{ id: 'implementation', outcome: 'RED→GREEN→commit' }],
      piVersion: '0.79.8',
      model: 'sonnet',
    };
    const piRunner = async () => trace;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, true);
  });

  it('Given a run-trace with phases undefined, when probe runs, then evidence.phases is an empty array', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const trace = {
      gateOutcome: 'green',
      gateRanBeforeCommit: true,
      committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
      mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
      phases: undefined,
      piVersion: '0.79.8',
      model: 'sonnet',
    };
    const piRunner = async () => trace;

    const result = await sut({ piRunner, fsOps });

    assert.deepEqual(result.evidence.phases, []);
  });
});

describe('runAcceptanceProbe() — sibling-directory path-prefix boundary', () => {
  it('Given a mutatedPath that is a sibling directory sharing the throwaway prefix, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const trace = {
      gateOutcome: 'green',
      gateRanBeforeCommit: true,
      committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
      mutatedPaths: [SIBLING_EVIL_PATH],
      phases: [{ id: 'implementation', outcome: 'RED→GREEN→commit' }],
      piVersion: '0.79.8',
      model: 'sonnet',
    };
    const piRunner = async () => trace;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, false);
  });
});

describe('runAcceptanceProbe() — throwaway-path trailing-slash normalisation', () => {
  it('Given a throwawayPath that already ends with a slash, when probe runs with mutations inside that path, then passed is true', async () => {
    const sut = runAcceptanceProbe;
    const trailingSlashPath = THROWAWAY_PATH + '/';
    const fsOps = makeFsOps(trailingSlashPath);
    const trace = {
      gateOutcome: 'green',
      gateRanBeforeCommit: true,
      committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
      mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
      phases: [{ id: 'implementation', outcome: 'RED→GREEN→commit' }],
      piVersion: '0.79.8',
      model: 'sonnet',
    };
    const piRunner = async () => trace;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, true);
  });

  it('Given a throwawayPath that already ends with a slash, when a mutatedPath is a child of that path, then passed is true', async () => {
    const sut = runAcceptanceProbe;
    const trailingSlashPath = THROWAWAY_PATH + '/';
    const fsOps = makeFsOps(trailingSlashPath);
    const trace = {
      gateOutcome: 'green',
      gateRanBeforeCommit: true,
      committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
      mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
      phases: [{ id: 'implementation', outcome: 'RED→GREEN→commit' }],
      piVersion: '0.79.8',
      model: 'sonnet',
    };
    const piRunner = async () => trace;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, true);
  });
});

describe('runAcceptanceProbe() — mutatedPath equals throwawayPath exactly', () => {
  it('Given a mutatedPath that equals the throwawayPath directory itself, when probe runs, then passed is true (dir itself is inside)', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const trace = {
      gateOutcome: 'green',
      gateRanBeforeCommit: true,
      committedArtifact: `${THROWAWAY_PATH}/src/feature.js`,
      mutatedPaths: [THROWAWAY_PATH],
      phases: [{ id: 'implementation', outcome: 'RED→GREEN→commit' }],
      piVersion: '0.79.8',
      model: 'sonnet',
    };
    const piRunner = async () => trace;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, true);
  });
});

describe('runAcceptanceProbe() — committedArtifact empty string', () => {
  it('Given a run-trace with committedArtifact as empty string, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const trace = {
      gateOutcome: 'green',
      gateRanBeforeCommit: true,
      committedArtifact: '',
      mutatedPaths: [`${THROWAWAY_PATH}/src/feature.js`],
      phases: [{ id: 'implementation', outcome: 'no-commit' }],
      piVersion: '0.79.8',
      model: 'sonnet',
    };
    const piRunner = async () => trace;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, false);
  });
});

describe('runAcceptanceProbe() — evidence shape and contents', () => {
  it('Given a green run-trace, when probe runs, then evidence.targetPath equals the throwaway path returned by fsOps.mktemp', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.evidence.targetPath, THROWAWAY_PATH);
  });

  it('Given a green run-trace, when probe runs, then evidence.piVersion matches the trace piVersion', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.evidence.piVersion, GREEN_TRACE.piVersion);
  });

  it('Given a green run-trace, when probe runs, then evidence.model matches the trace model', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.evidence.model, GREEN_TRACE.model);
  });

  it('Given a green run-trace, when probe runs, then evidence.phases matches the trace phases', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.deepEqual(result.evidence.phases, GREEN_TRACE.phases);
  });

  it('Given a green run-trace, when probe runs, then evidence.portsExercised is a new array (not the frozen source)', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(Object.isFrozen(result.evidence.portsExercised), false);
  });

  it('Given a green run-trace, when probe runs, then evidence.portsExercised contains exactly Execution, Model, Gate, VCS', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.deepEqual(result.evidence.portsExercised, ['Execution', 'Model', 'Gate', 'VCS']);
  });
});

describe('runAcceptanceProbe() — gate-green-before-commit conjuncts isolated', () => {
  it('Given a run-trace with a red gate that ran before the commit, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => RED_BEFORE_COMMIT_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, false);
  });

  it('Given a run-trace with a green gate that ran after the commit, when probe runs, then passed is false', async () => {
    const sut = runAcceptanceProbe;
    const fsOps = makeFsOps(THROWAWAY_PATH);
    const piRunner = async () => GREEN_AFTER_COMMIT_TRACE;

    const result = await sut({ piRunner, fsOps });

    assert.equal(result.passed, false);
  });
});
