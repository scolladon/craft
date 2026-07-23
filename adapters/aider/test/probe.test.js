import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAcceptanceProbe } from '../src/probe.js';

const THROWAWAY = '/tmp/probe-throwaway';

function greenTrace(extra = {}) {
  return {
    aiderVersion: '0.86.1',
    model: 'anthropic/claude-sonnet-4-6',
    gateOutcome: 'green',
    gateRanBeforeCommit: true,
    committedArtifact: 'src/thing.js',
    mutatedPaths: [`${THROWAWAY}/src/thing.js`],
    phases: ['implementation'],
    ...extra,
  };
}

const fsOps = { mktemp: async () => THROWAWAY };

describe('runAcceptanceProbe — drives the shared harness with aider launch args', () => {
  it('Given a green run-trace, when probed, then it passes and reports the aiderVersion + ports', async () => {
    const aiderRunner = async () => greenTrace();

    const sut = await runAcceptanceProbe({ aiderRunner, fsOps });

    assert.equal(sut.passed, true);
    assert.equal(sut.evidence.aiderVersion, '0.86.1');
    assert.deepEqual(sut.evidence.portsExercised, ['Execution', 'Model', 'Gate', 'VCS']);
  });

  it('Given the runner invocation, when probed, then it receives the aider launch argv scoping the session via cwd, not argv', async () => {
    let seenArgs;
    let seenWorkingDir;
    const aiderRunner = async (opts) => {
      seenArgs = opts.launchArgs;
      seenWorkingDir = opts.workingDir;
      return greenTrace();
    };

    await runAcceptanceProbe({ aiderRunner, fsOps });

    assert.equal(seenArgs[seenArgs.indexOf('--model') + 1], 'anthropic/claude-sonnet-4-6');
    assert.ok(seenArgs.includes('--auto-commits'));
    assert.ok(seenArgs.includes('--no-attribute-co-authored-by'));
    assert.equal(seenArgs.includes('--workspace'), false);
    assert.equal(seenArgs.includes('--working-dir'), false);
    assert.equal(seenArgs.includes('--cwd'), false);
    assert.equal(seenWorkingDir, THROWAWAY);
  });

  it('Given a run-trace that committed on a red gate, when probed, then it fails (never-commit-on-red)', async () => {
    const aiderRunner = async () => greenTrace({ gateOutcome: 'red' });

    const sut = await runAcceptanceProbe({ aiderRunner, fsOps });

    assert.equal(sut.passed, false);
  });

  it('Given a run-trace that wrote outside the throwaway, when probed, then it fails (containment)', async () => {
    const aiderRunner = async () => greenTrace({ mutatedPaths: ['/etc/passwd'] });

    const sut = await runAcceptanceProbe({ aiderRunner, fsOps });

    assert.equal(sut.passed, false);
  });

  it('Given a run-trace with no committed artifact, when probed, then it fails (artifact-is-the-handoff)', async () => {
    const aiderRunner = async () => greenTrace({ committedArtifact: null });

    const sut = await runAcceptanceProbe({ aiderRunner, fsOps });

    assert.equal(sut.passed, false);
  });
});
