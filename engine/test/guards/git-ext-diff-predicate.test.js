import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gitExtDiffPredicate } from '../../src/guards/git-ext-diff-predicate.js';

describe('gitExtDiffPredicate() — compliant markers', () => {
  it('Given a git diff command carrying --no-ext-diff, when checked, then returns block: false', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('git diff --no-ext-diff HEAD~1');

    assert.equal(result.block, false);
  });

  it('Given a git diff command wrapped in rtk proxy, when checked, then returns block: false', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('rtk proxy git diff');

    assert.equal(result.block, false);
  });
});

describe('gitExtDiffPredicate() — bare git diff/show without --no-ext-diff', () => {
  it('Given a bare git diff command, when checked, then returns block: true with the exact reason', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('git diff');

    assert.equal(result.block, true);
    assert.equal(
      result.reason,
      'git diff/show must carry --no-ext-diff (external diff mangles parsed output)',
    );
  });

  it('Given a bare git show command, when checked, then returns block: true with the exact reason', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('git show HEAD');

    assert.equal(result.block, true);
    assert.equal(
      result.reason,
      'git diff/show must carry --no-ext-diff (external diff mangles parsed output)',
    );
  });
});

describe('gitExtDiffPredicate() — non-git commands', () => {
  it('Given a non-git bash command, when checked, then returns block: false', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('ls -la');

    assert.equal(result.block, false);
  });
});

describe('gitExtDiffPredicate() — interposed global options', () => {
  for (const command of [
    'git -C /x diff',
    'git -c core.pager=cat diff',
    'git --git-dir=/repo/.git diff',
    'git --work-tree=/repo/work diff',
    'git -C /x -c a.b=c diff',
    'git --git-dir=/repo/.git show HEAD',
  ]) {
    it(`Given "${command}" (interposed global option before diff/show), when checked, then returns block: true`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }
});

describe('gitExtDiffPredicate() — collapsed/extra whitespace cannot slip past', () => {
  for (const command of [
    'git  diff',           // two spaces before the subcommand
    'git   show HEAD',     // three spaces before the subcommand
    'git  -C /x diff',     // two spaces before the global option
    'git -C  /x diff',     // two spaces inside the -C value separator
    'git -c  core.pager=cat diff', // two spaces inside the -c value separator
  ]) {
    it(`Given "${command}" (non-single whitespace), when checked, then returns block: true`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }
});

describe('gitExtDiffPredicate() — command-separator anchored git diff/show', () => {
  for (const command of [
    'echo hi; git diff',
    'true;git diff',
    'ls && git show',
    'cat foo | git diff',
  ]) {
    it(`Given "${command}" (git diff/show after a shell separator), when checked, then returns block: true`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }
});

describe('gitExtDiffPredicate() — regex negatives', () => {
  it('Given a git show-ref command, when checked, then returns block: false', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('git show-ref');

    assert.equal(result.block, false);
  });

  it('Given a git stash show command, when checked, then returns block: false', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('git stash show');

    assert.equal(result.block, false);
  });

  it('Given a git difftool command, when checked, then returns block: false', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('git difftool');

    assert.equal(result.block, false);
  });
});
