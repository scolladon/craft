import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { plainGitCommandVerdict as sut } from '../../src/guards/git-bash-verdict.js';
import { COMPLEX_NEAR_GIT_REASON } from '../../src/guards/git-plain-command-gate.js';

const PUSH_REASON = /destructive git \(push\)/;

describe('plainGitCommandVerdict() - gate, then destructive git, then ext-diff over one parse', () => {
  it('Given a shell-wrapped push, When judged, Then the gate verdict wins over the parse', () => {
    const result = sut("bash -lc 'git push'");

    assert.deepEqual(result, { block: true, reason: COMPLEX_NEAR_GIT_REASON });
  });

  it('Given a push chained before a git diff, When judged, Then destructive git wins over ext-diff', () => {
    const result = sut('git push; git diff');

    assert.equal(result.block, true);
    assert.match(result.reason, PUSH_REASON);
  });

  it('Given a bare git diff, When judged, Then the ext-diff rule blocks', () => {
    const result = sut('git diff');

    assert.equal(result.block, true);
    assert.match(result.reason, /--no-ext-diff/);
  });

  for (const command of ['git -C . push origin main', 'git --git-dir=.git push origin main']) {
    it(`Given "${command}", When judged, Then the push is blocked`, () => {
      const result = sut(command);

      assert.equal(result.block, true);
      assert.match(result.reason, PUSH_REASON);
    });
  }

  it('Given an unparseable command with no git word, When judged, Then it is blocked as not parseable', () => {
    const result = sut('echo "$(');

    assert.equal(result.block, true);
    assert.match(result.reason, /not parseable/);
  });

  it('Given git status, When judged, Then it is allowed', () => {
    const result = sut('git status');

    assert.deepEqual(result, { block: false });
  });
});
