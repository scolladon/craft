import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gitDestructivePredicate } from '../../src/guards/git-destructive-predicate.js';
import { gitInvocations, INLINE_ALIAS_REASON } from '../../src/guards/shell-git-invocations.js';

const REASON_DYNAMIC_SUBCOMMAND =
  'craft: the git subcommand comes from an expansion — spell the verb out; denied fail-closed in this binding';
const REASON_PUSH = 'craft: destructive git (push) is denied in this binding — run it outside the agent';

describe('gitDestructivePredicate() — push', () => {
  for (const command of [
    'git push',
    'git -C . push origin main',
    'git --git-dir=.git push',
    'git -c k=v push',
    'env git push',
    '(git push)',
    "bash -c 'git push'",
    '/usr/bin/git push',
  ]) {
    it(`Given "${command}", when checked, then blocks with the push reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    });
  }
});

const REASON_RESET =
  'craft: destructive git (reset --hard) is denied in this binding — run it outside the agent';

describe('gitDestructivePredicate() — reset', () => {
  for (const command of ['git reset --hard', 'git reset --hard HEAD', 'git reset HEAD --hard', 'git reset -q --hard']) {
    it(`Given "${command}", when checked, then blocks with the reset reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_RESET });
    });
  }

  for (const command of ['git reset --keep', 'git reset --merge', 'git reset', 'git reset -- --hard']) {
    it(`Given "${command}", when checked, then does not block`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

const REASON_CLEAN =
  'craft: destructive git (clean without --dry-run) is denied in this binding — run it outside the agent';

describe('gitDestructivePredicate() — clean', () => {
  for (const command of [
    'git clean -f',
    'git clean -fd',
    'git clean -df',
    'git clean -xdf',
    'git clean -fx',
    'git clean --force',
    'git clean -d',
    'git clean -i',
    'git -c clean.requireForce=false clean',
  ]) {
    it(`Given "${command}", when checked, then blocks with the clean reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_CLEAN });
    });
  }

  for (const command of ['git clean -n -f', 'git clean -f -n', 'git clean -nf', 'git clean --dry-run']) {
    it(`Given "${command}", when checked, then does not block`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

const REASON_BRANCH =
  'craft: destructive git (forced branch delete) is denied in this binding — run it outside the agent';

describe('gitDestructivePredicate() — branch', () => {
  for (const command of [
    'git branch -D x',
    'git branch -df x',
    'git branch -fd x',
    'git branch --delete --force x',
    'git branch -d -f x',
    'git branch -Dr origin/x',
  ]) {
    it(`Given "${command}", when checked, then blocks with the branch reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_BRANCH });
    });
  }

  for (const command of ['git branch -d x', 'git branch --delete x', 'git branch -f x y', 'git branch', 'git branch -a']) {
    it(`Given "${command}", when checked, then does not block`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

const REASON_ALIAS_INLINE = INLINE_ALIAS_REASON;

describe('gitDestructivePredicate() — unparseable, unclassifiable and dynamic input', () => {
  it('Given an unterminated quote, when checked, then blocks with the parse reason', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git push\necho "x');

    assert.deepEqual(result, { block: true, reason: gitInvocations('git push\necho "x').reason });
    assert.match(result.reason, /unterminated/i);
  });

  for (const command of ['git --frobnicate push', 'git -C. push', 'git $OPTS push', '$G push']) {
    it(`Given "${command}", when checked, then blocks with the push reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    });
  }

  for (const command of ['git -c alias.p=push p', 'git --config-env alias.x=HOME x']) {
    it(`Given "${command}", when checked, then blocks with the inline alias reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_ALIAS_INLINE });
    });
  }

  it('Given a reset with a dynamic argument, when checked, then blocks with the reset reason', () => {
    const sut = gitDestructivePredicate;

    const result = sut('H=--hard; git reset $H');

    assert.deepEqual(result, { block: true, reason: REASON_RESET });
  });

  it('Given a branch with a dynamic argument, when checked, then blocks with the branch reason', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git branch "$F" x');

    assert.deepEqual(result, { block: true, reason: REASON_BRANCH });
  });
});

describe('gitDestructivePredicate() — routine git passes', () => {
  for (const command of [
    'git --version',
    'git --no-optional-locks -C /w -c core.fsmonitor=false remote -v',
    'git --no-optional-locks -c core.fsmonitor=false rev-parse origin/HEAD',
    'git status',
    'git add -A',
    "git commit -m 'x'",
    'git commit -m "$(cat <<\'EOF\'\nfeat: x\nEOF\n)"',
    'git log --oneline -3',
    'git diff --no-ext-diff',
    'git worktree add ../w -b b',
    'git worktree list',
    'git worktree remove ../w',
    'git rev-parse HEAD',
    'git branch -d merged',
  ]) {
    it(`Given "${command}", when checked, then does not block`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

describe('gitDestructivePredicate() — known over-blocking', () => {
  for (const command of ['echo git push', '$HOME/bin/deploy push']) {
    it(`Given "${command}", when checked, then blocks (accepted false positive)`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }
});

describe('gitDestructivePredicate() — a subcommand carried by an expansion', () => {
  for (const command of ['P=push; git $P', 'git $(echo push)', 'git -C . "$VERB"', 'git $A $B']) {
    it(`Given "${command}", when checked, then blocks with the dynamic subcommand reason`, () => {
      const sut = gitDestructivePredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: REASON_DYNAMIC_SUBCOMMAND });
    });
  }

  it('Given a dynamic option followed by a literal safe subcommand, when checked, then it allows', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git $OPTS status');

    assert.deepEqual(result, { block: false });
  });
});
