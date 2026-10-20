import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { plainGitCommandVerdict as sut } from '../../src/guards/git-bash-verdict.js';
import { COMPLEX_NEAR_GIT_REASON } from '../../src/guards/git-plain-command-gate.js';

const PUSH_REASON = 'craft: destructive git (push) is denied in this binding — run it outside the agent';
const EXT_DIFF_REASON = 'git diff/show must carry --no-ext-diff (external diff mangles parsed output)';
const UNPARSEABLE_REASON = 'craft: command not parseable (unterminated substitution) — denied fail-closed';

const ALIAS_REASON =
  'craft: git config naming an alias or include key is denied \u2014 an alias can run any git verb';
const EXT_DIFF_OPTION_REASON = '--ext-diff is denied on every git verb (external diff mangles parsed output)';

describe('plainGitCommandVerdict() - gate, then destructive git, then ext-diff over one parse', () => {
  it('Given a shell-wrapped push, When judged, Then the gate verdict wins over the parse', () => {
    const result = sut("bash -lc 'git push'");

    assert.deepEqual(result, { block: true, reason: COMPLEX_NEAR_GIT_REASON });
  });

  it('Given a push chained before a git diff, When judged, Then destructive git wins over ext-diff', () => {
    const result = sut('git push; git diff');

    assert.deepEqual(result, { block: true, reason: PUSH_REASON });
  });

  it('Given a bare git diff, When judged, Then the ext-diff rule blocks', () => {
    const result = sut('git diff');

    assert.deepEqual(result, { block: true, reason: EXT_DIFF_REASON });
  });

  for (const command of ['git -C . push origin main', 'git --git-dir=.git push origin main']) {
    it(`Given "${command}", When judged, Then the push is blocked`, () => {
      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: PUSH_REASON });
    });
  }

  it('Given an unparseable command with no git word, When judged, Then it is blocked as not parseable', () => {
    const result = sut('echo "$(');

    assert.deepEqual(result, { block: true, reason: UNPARSEABLE_REASON });
  });

  it('Given git status, When judged, Then it is allowed', () => {
    const result = sut('git status');

    assert.deepEqual(result, { block: false });
  });

  it('Given git log with --ext-diff, When judged, Then the ext-diff option reason blocks', () => {
    const result = sut('git log -p -1 --ext-diff');

    assert.deepEqual(result, { block: true, reason: EXT_DIFF_OPTION_REASON });
  });

  for (const command of ['git config alias.x diff', 'git config alias.p push; git p', 'git config rename-section foo include']) {
    it(`Given "${command}", When judged, Then the alias reason blocks`, () => {
      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: ALIAS_REASON });
    });
  }

  it('Given git config user.name, When judged, Then it is allowed', () => {
    const result = sut('git config user.name x');

    assert.deepEqual(result, { block: false });
  });
});
