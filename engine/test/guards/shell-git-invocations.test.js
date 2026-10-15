import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gitDestructivePredicate } from '../../src/guards/git-destructive-predicate.js';
import { gitExtDiffPredicate } from '../../src/guards/git-ext-diff-predicate.js';
import { parseShellCommands } from '../../src/guards/shell-tokeniser.js';
import { gitInvocations, hasInlineAlias, judgeParsed } from '../../src/guards/shell-git-invocations.js';

const subcommand = (name, args = [], configKeys = [], dynamicArgCount = 0) => ({
  kind: 'subcommand',
  subcommand: name,
  args,
  configKeys,
  dynamicArgCount,
});

describe('gitInvocations()', () => {
  const invocation = (name, leadingWords = [], args = []) => ({
    ...subcommand(name, args),
    leadingWords,
  });

  for (const [command, expected] of [
    ['git -C . push', [invocation('push')]],
    ['env git diff', [invocation('diff', ['env'])]],
    ['/usr/bin/git diff', [invocation('diff')]],
    ['echo git push', [invocation('push', ['echo'])]],
    ['git log --grep git show', [invocation('log', [], ['--grep', 'git', 'show']), invocation('show', ['git', 'log'])]],
    ['ls /x/git push', [invocation('push', ['ls'])]],
    ['rtk proxy git diff', [invocation('diff', ['rtk', 'proxy'])]],
  ]) {
    it(`Given ${JSON.stringify(command)}, when anchored, then the invocations match`, () => {
      const sut = gitInvocations;

      const result = sut(command);

      assert.deepEqual(result, { parsed: true, invocations: expected });
    });
  }

  it('Given a dynamic head, when anchored, then a dynamic-head invocation is returned', () => {
    const sut = gitInvocations;

    const result = sut('$G push');

    assert.deepEqual(result, { parsed: true, invocations: [{ ...subcommand('push'), leadingWords: [] }] });
  });

  it('Given an unterminated quote, when anchored, then the parse failure is returned', () => {
    const sut = gitInvocations;

    const result = sut('echo "x');

    assert.deepEqual(result, parseShellCommands('echo "x'));
    assert.equal(result.parsed, false);
  });
});

describe('hasInlineAlias()', () => {
  for (const [command, expected] of [
    ['git -c alias.d=diff d', true],
    ['git -c core.pager=cat diff', false],
  ]) {
    it(`Given ${JSON.stringify(command)}, when checked, then ${expected}`, () => {
      const sut = hasInlineAlias;
      const [first] = gitInvocations(command).invocations;

      const result = sut(first);

      assert.equal(result, expected);
    });
  }

  it('Given a non-subcommand invocation, when checked, then false', () => {
    const sut = hasInlineAlias;

    const result = sut({ kind: 'no-subcommand' });

    assert.equal(result, false);
  });
});

const REASON_PUSH = 'craft: destructive git (push) is denied in this binding — run it outside the agent';
const MAX_ANCHORS = 256;
const TOO_MANY_REASON =
  'craft: command not parseable (too many git invocations) — denied fail-closed';
// Far below the host's ~30 s hook timeout yet loose enough for coverage-instrumented CI runs.
const MAX_ELAPSED_MS = 3000;

const timed = work => {
  const start = performance.now();
  const result = work();
  return { result, elapsed: performance.now() - start };
};

describe('shell parsing — bounded work', () => {
  it('Given many git words before a push, when checked, then blocks with the push reason in bounded time', () => {
    const sut = gitDestructivePredicate;

    const { result, elapsed } = timed(() => sut('echo ' + 'git '.repeat(25000) + '; git push'));

    assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a long run of global flags in a command, when checked, then it finishes in bounded time', () => {
    const sut = gitInvocations;

    const { result, elapsed } = timed(() => sut('git ' + '--no-pager '.repeat(11000) + 'status'));

    assert.equal(result.invocations[0].subcommand, 'status');
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a chain of eval words before a push, when checked, then blocks in bounded time', () => {
    const sut = gitDestructivePredicate;

    const { result, elapsed } = timed(() => sut('eval '.repeat(16000) + 'x; git push origin main'));

    assert.equal(result.block, true);
    assert.match(result.reason, /^craft: /);
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a long shell option cluster that is not a command string, when checked, then blocks the push in bounded time', () => {
    const sut = gitDestructivePredicate;

    const { result, elapsed } = timed(() => sut('sh -' + 'c'.repeat(100000) + '! x; git push'));

    assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a long run of braces closing as one expression, when checked, then it finishes in bounded time', () => {
    const sut = gitExtDiffPredicate;

    const { result, elapsed } = timed(() => sut('{'.repeat(65000) + ',}'));

    assert.deepEqual(result, { block: false });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a long run of braces that never close, when checked, then blocks the push in bounded time', () => {
    const sut = gitDestructivePredicate;

    const { result, elapsed } = timed(() => sut('{'.repeat(60000) + '; git push'));

    assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a long chain of env split options, when checked, then blocks the push in bounded time', () => {
    const sut = gitDestructivePredicate;

    const { result, elapsed } = timed(() => sut('env -S '.repeat(18000) + '; git push'));

    assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a long chain of shell command options, when checked, then blocks the push in bounded time', () => {
    const sut = gitDestructivePredicate;

    const { result, elapsed } = timed(() => sut('sh -c '.repeat(21000) + '; git push'));

    assert.deepEqual(result, { block: true, reason: REASON_PUSH });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given git words that are values of earlier global options, when checked, then it finishes in bounded time', () => {
    const sut = gitExtDiffPredicate;

    const { result, elapsed } = timed(() => sut('git' + ' -c git'.repeat(18000) + ' status'));

    assert.deepEqual(result, { block: false });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a git word that is the value of an earlier global option, when checked, then the push after it is blocked', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git -C git push');

    assert.deepEqual(result, { block: true, reason: REASON_PUSH });
  });

  it('Given a long run of shell words that are flags, when checked, then it finishes in bounded time', () => {
    const sut = gitExtDiffPredicate;

    const { result, elapsed } = timed(() => sut('+/sh '.repeat(26213) + '-c'));

    assert.deepEqual(result, { block: false });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given more argument-reading git invocations than the cap, when checked, then it is denied fail-closed in bounded time', () => {
    const sut = gitDestructivePredicate;

    const { result, elapsed } = timed(() => sut('git branch '.repeat(11900)));

    assert.deepEqual(result, { block: true, reason: TOO_MANY_REASON });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given many proxied diffs, when checked, then it is denied fail-closed in bounded time', () => {
    const sut = gitExtDiffPredicate;

    const { result, elapsed } = timed(() => sut('rtk proxy git diff '.repeat(6850)));

    assert.deepEqual(result, { block: true, reason: TOO_MANY_REASON });
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given exactly the cap of argument-reading git invocations, when checked, then they are judged', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git branch '.repeat(MAX_ANCHORS));

    assert.deepEqual(result, { block: false });
  });

  it('Given one more than the cap, when checked, then it is denied fail-closed', () => {
    const sut = gitDestructivePredicate;

    const result = sut('git branch '.repeat(MAX_ANCHORS + 1));

    assert.deepEqual(result, { block: true, reason: TOO_MANY_REASON });
  });

  it('Given more git words than the cap that read no arguments, when checked, then the push after them is blocked', () => {
    const sut = gitDestructivePredicate;

    const result = sut('echo ' + 'git '.repeat(MAX_ANCHORS + 1) + '; git push');

    assert.deepEqual(result, { block: true, reason: REASON_PUSH });
  });

});

describe('judgeParsed', () => {
  const denyPush = invocation => (invocation.subcommand === 'push' ? 'no push' : null);

  it('Given a parsed command with a denied invocation, When judged, Then it blocks with the verdict reason', () => {
    const parsed = gitInvocations('git status && git push');

    const result = judgeParsed(parsed, denyPush);

    assert.deepEqual(result, { block: true, reason: 'no push' });
  });

  it('Given a parsed command nobody denies, When judged, Then it is allowed', () => {
    const parsed = gitInvocations('git status');

    const result = judgeParsed(parsed, denyPush);

    assert.deepEqual(result, { block: false });
  });

  it('Given an unparsed result, When judged, Then it blocks with the parser reason', () => {
    const parsed = { parsed: false, reason: 'cannot parse' };

    const result = judgeParsed(parsed, denyPush);

    assert.deepEqual(result, { block: true, reason: 'cannot parse' });
  });
});
