import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAcceptanceProbe } from '../src/probe.js';

const THROWAWAY = '/tmp/probe-throwaway';

function greenTrace(extra = {}) {
  return {
    cursorVersion: '2026.07.20-8cc9c0b',
    model: 'claude-sonnet-5-high',
    gateOutcome: 'green',
    gateRanBeforeCommit: true,
    committedArtifact: 'src/thing.js',
    mutatedPaths: [`${THROWAWAY}/src/thing.js`],
    phases: ['implementation'],
    ...extra,
  };
}

const fsOps = { mktemp: async () => THROWAWAY };

describe('runAcceptanceProbe — drives the shared harness with cursor launch args', () => {
  it('Given a green run-trace, when probed, then it passes and reports the cursorVersion + ports', async () => {
    const cursorRunner = async () => greenTrace();

    const sut = await runAcceptanceProbe({ cursorRunner, fsOps });

    assert.equal(sut.passed, true);
    assert.equal(sut.evidence.cursorVersion, '2026.07.20-8cc9c0b');
    assert.deepEqual(sut.evidence.portsExercised, ['Execution', 'Model', 'Gate']);
  });

  it('Given the runner invocation, when probed, then it receives the cursor launch argv scoping the session to the throwaway', async () => {
    let seenArgs;
    const cursorRunner = async (opts) => {
      seenArgs = opts.launchArgs;
      return greenTrace();
    };

    await runAcceptanceProbe({ cursorRunner, fsOps });

    assert.equal(seenArgs[0], '-p');
    assert.equal(seenArgs[seenArgs.indexOf('--workspace') + 1], THROWAWAY);
    assert.equal(seenArgs[seenArgs.indexOf('--model') + 1], 'claude-sonnet-5-high');
  });

  it('Given a run-trace that committed on a red gate, when probed, then it fails (never-commit-on-red)', async () => {
    const cursorRunner = async () => greenTrace({ gateOutcome: 'red' });

    const sut = await runAcceptanceProbe({ cursorRunner, fsOps });

    assert.equal(sut.passed, false);
  });

  it('Given a run-trace that wrote outside the throwaway, when probed, then it fails (containment)', async () => {
    const cursorRunner = async () => greenTrace({ mutatedPaths: ['/etc/passwd'] });

    const sut = await runAcceptanceProbe({ cursorRunner, fsOps });

    assert.equal(sut.passed, false);
  });

  it('Given a run-trace with no committed artifact, when probed, then it fails (artifact-is-the-handoff)', async () => {
    const cursorRunner = async () => greenTrace({ committedArtifact: null });

    const sut = await runAcceptanceProbe({ cursorRunner, fsOps });

    assert.equal(sut.passed, false);
  });
});
