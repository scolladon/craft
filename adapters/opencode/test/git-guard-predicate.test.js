import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gitGuardPredicate } from '../src/git-guard-predicate.js';

const BLOCK_COMMANDS = [
  'git diff',
  'git show',
  'git diff HEAD~1',
  'git show HEAD',
  'cd /repo; git diff HEAD',
  'git -C /x diff',
  'git -c k=v show',
  'git --git-dir=.g diff',
  'git --work-tree=. show',
];

const PASS_COMMANDS = [
  'git diff --no-ext-diff HEAD~1',
  'git --no-ext-diff show HEAD',
  'rtk proxy git diff',
  'git difftool',
  'git show-ref',
  'git stash show',
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

  it('Given a bare git show without --no-ext-diff, when guarded, then reason mentions external diff', () => {
    const sut = gitGuardPredicate;

    const result = sut('git show HEAD');

    assert.ok(result.reason.includes('external diff'), `reason must mention external diff, got: ${result.reason}`);
  });
});

describe('gitGuardPredicate() — property lens', () => {
  it('Given any command containing --no-ext-diff, when guarded, then never blocks', () => {
    const sut = gitGuardPredicate;
    const commands = [
      'git diff --no-ext-diff',
      'git show --no-ext-diff HEAD',
      'foo --no-ext-diff bar',
    ];

    const results = commands.map(sut);

    assert.ok(results.every((result) => result.block === false));
  });

  it('Given a bare git diff/show with no compliant marker, when guarded, then always blocks', () => {
    const sut = gitGuardPredicate;
    const commands = ['git diff', 'git show', 'git diff HEAD', 'git show HEAD~2'];

    const results = commands.map(sut);

    assert.ok(results.every((result) => result.block === true));
  });
});
