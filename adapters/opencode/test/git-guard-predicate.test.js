import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gitGuardPredicate } from '../src/git-guard-predicate.js';

const BLOCK_COMMANDS = [
  'git diff',
  'git show --ext-diff',
  'git diff HEAD~1',
  'git diff HEAD',
  'cd /repo; git diff HEAD',
  'git -C /x diff',
  'git -c k=v diff',
  'git --git-dir=.g diff',
  'git --work-tree=. diff',
  'echo --no-ext-diff; git diff HEAD', // a marker in an unrelated segment must not exempt the git call
];

const PASS_COMMANDS = [
  'git diff --no-ext-diff HEAD~1',
  'git --no-ext-diff show HEAD',
  'rtk proxy git diff',
  'git difftool',
  'git show-ref',
  'git stash show',
  'git show',
  'git show HEAD',
  'git show --stat',
  'git -c k=v show',
  'git --work-tree=. show',
  'ls -la',
  '',
];

describe('gitGuardPredicate() — git diff/show regex pin: documented cases', () => {
  for (const command of BLOCK_COMMANDS) {
    it(`Given "${command}", when guarded, then returns block: true`, () => {
      const sut = gitGuardPredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }

  for (const command of PASS_COMMANDS) {
    it(`Given "${command}", when guarded, then returns block: false`, () => {
      const sut = gitGuardPredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

describe('gitGuardPredicate() — reason string content on git block', () => {
  it('Given a bare git diff without --no-ext-diff, when guarded, then reason mentions --no-ext-diff', () => {
    const sut = gitGuardPredicate;

    const result = sut('git diff HEAD~1');

    assert.ok(result.reason.includes('--no-ext-diff'), `reason must mention --no-ext-diff, got: ${result.reason}`);
  });

  it('Given a bare git diff HEAD without --no-ext-diff, when guarded, then reason mentions external diff', () => {
    const sut = gitGuardPredicate;

    const result = sut('git diff HEAD');

    assert.ok(result.reason.includes('external diff'), `reason must mention external diff, got: ${result.reason}`);
  });
});

describe('gitGuardPredicate() — property lens', () => {
  it('Given commands whose every git diff/show invocation carries --no-ext-diff (or run no git diff/show), when guarded, then never blocks', () => {
    const sut = gitGuardPredicate;
    const commands = [
      'git diff --no-ext-diff',
      'git show --no-ext-diff HEAD',
      'foo --no-ext-diff bar',
    ];

    const results = commands.map(sut);

    assert.ok(results.every((result) => result.block === false));
  });

  it('Given a bare git diff, or a git show enabling --ext-diff, with no compliant marker, when guarded, then always blocks', () => {
    const sut = gitGuardPredicate;
    const commands = ['git diff', 'git diff HEAD', 'git diff HEAD~2', 'git show --ext-diff'];

    const results = commands.map(sut);

    assert.ok(results.every((result) => result.block === true));
  });
});
