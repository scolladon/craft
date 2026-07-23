import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVcsPostureArgs, reconcileGateOutcome } from '../src/vcs-posture.js';

describe('buildVcsPostureArgs — the first-class VCS commit posture', () => {
  it('Given no params, when built, then it deep-equals the exact five-flag posture in order', () => {
    const sut = buildVcsPostureArgs();

    assert.deepEqual(sut, [
      '--auto-commits',
      '--no-dirty-commits',
      '--no-attribute-author',
      '--no-attribute-committer',
      '--no-attribute-co-authored-by',
    ]);
  });

  it('Given the posture, when inspected, then all three --no-attribute-* flags are present', () => {
    const sut = buildVcsPostureArgs();

    assert.equal(sut.includes('--no-attribute-author'), true);
    assert.equal(sut.includes('--no-attribute-committer'), true);
    assert.equal(sut.includes('--no-attribute-co-authored-by'), true);
  });

  it('Given the posture, when inspected, then --auto-commits and --no-dirty-commits are present', () => {
    const sut = buildVcsPostureArgs();

    assert.equal(sut.includes('--auto-commits'), true);
    assert.equal(sut.includes('--no-dirty-commits'), true);
  });

  it('Given two calls, when compared, then they return distinct array instances (no shared mutable state)', () => {
    const first = buildVcsPostureArgs();
    const second = buildVcsPostureArgs();

    assert.notEqual(first, second);
  });
});

describe('reconcileGateOutcome — the pure reset-on-red decision', () => {
  it('Given a green gate outcome, when reconciled, then it accepts the auto-commit', () => {
    const sut = reconcileGateOutcome({ gateOutcome: 'green', preTurnHead: 'abc123' });

    assert.deepEqual(sut, { action: 'accept' });
  });

  it('Given a red gate outcome, when reconciled, then it resets to the pre-turn HEAD', () => {
    const sut = reconcileGateOutcome({ gateOutcome: 'red', preTurnHead: 'abc123' });

    assert.deepEqual(sut, { action: 'reset', target: 'abc123' });
  });

  it('Given a non-green, non-red outcome, when reconciled, then it still resets (green is the only accept)', () => {
    const sut = reconcileGateOutcome({ gateOutcome: 'error', preTurnHead: 'abc123' });

    assert.deepEqual(sut, { action: 'reset', target: 'abc123' });
  });

  it('Given a red outcome with an empty preTurnHead, when reconciled, then it throws (no reset target)', () => {
    assert.throws(
      () => reconcileGateOutcome({ gateOutcome: 'red', preTurnHead: '' }),
      /preTurnHead/,
    );
  });
});
