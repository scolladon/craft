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

describe('gitExtDiffPredicate() — a non-compliant git diff/show before a separator still blocks', () => {
  for (const command of [
    'git diff; echo ok',
    'git show HEAD && true',
    'git diff | cat',
    'git diff\necho done',
  ]) {
    it(`Given ${JSON.stringify(command)} (non-compliant invocation in a non-final segment), when checked, then returns block: true`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }
});

describe('gitExtDiffPredicate() — fail-open bypasses now closed', () => {
  for (const command of [
    ' git diff', // leading space on the first line
    '\tgit diff', // leading tab
    'cd repo\ngit diff', // git diff on a command's second line
    'true\ngit show HEAD', // git show on a second line
    'echo --no-ext-diff; git diff HEAD', // marker hidden in an unrelated echo
    'git diff HEAD #--no-ext-diff', // marker hidden in a trailing comment
    'git diff --no-ext-diff; git show HEAD', // compliant first invocation must not exempt the second
  ]) {
    it(`Given ${JSON.stringify(command)} (previously a fail-open bypass), when checked, then returns block: true`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }
});

describe('gitExtDiffPredicate() — per-invocation compliance still allows genuinely compliant compounds', () => {
  for (const command of [
    'git diff --no-ext-diff; git show --no-ext-diff HEAD', // every invocation compliant
    'cd repo && git diff --no-ext-diff', // compliant after a separator
    'git diff --no-ext-diff # inline note', // a real comment does not disarm a compliant command
  ]) {
    it(`Given ${JSON.stringify(command)} (every git invocation compliant), when checked, then returns block: false`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

describe('gitExtDiffPredicate() — quote-aware: a metachar inside a quoted option value must not fragment the command', () => {
  for (const command of [
    "git -C '/Users/me/My & Co/repo' diff", // quoted & inside -C value (single quotes)
    'git -C "/a & b" diff', // quoted & inside -C value (double quotes — both quote kinds tracked)
    "git -c core.pager='diff-so-fancy | less' diff", // quoted | inside -c value
    "git --git-dir='/a;b/.git' show HEAD", // quoted ; inside --git-dir value
  ]) {
    it(`Given ${JSON.stringify(command)} (quoted metachar in an option value), when checked, then returns block: true`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }
});

describe('gitExtDiffPredicate() — a quote closes, so a real separator after it still splits', () => {
  it('Given a compliant quoted-option invocation then a non-compliant one after ";", when checked, then returns block: true', () => {
    const sut = gitExtDiffPredicate;

    // If the quote state failed to close, the ";" would be read as still-inside-quotes and the
    // whole line would be one compliant segment (marker present) → wrongly allowed.
    const result = sut("git -c x='y' diff --no-ext-diff; git show HEAD");

    assert.equal(result.block, true);
  });
});

describe('gitExtDiffPredicate() — a "#" inside a quoted value is not a comment', () => {
  it('Given a compliant command whose option value contains a #hex colour, when checked, then the marker still exempts it (block: false)', () => {
    const sut = gitExtDiffPredicate;

    const result = sut("git -c color.diff.new='#00ff00' diff --no-ext-diff");

    assert.equal(result.block, false);
  });
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

describe('gitExtDiffPredicate() — shell grammar no longer hides a diff/show', () => {
  for (const command of [
    'echo \\"; git diff',
    "echo \\'; git diff",
    "echo $'a\\'b'; git diff",
    "cat <<EOF\nit's\nEOF\ngit diff",
    '(git diff)',
    'true && (git diff)',
    '{ git diff; }',
    '! git diff',
    'time git diff',
    'if true; then git diff; fi',
    'case x in x) git diff;; esac',
    'f(){ git diff; }; f',
    'FOO=1 git diff',
    'x=$((1+2)) git diff',
    'env git diff',
    'command git diff',
    'exec git diff',
    'nohup git diff',
    'echo x | xargs git diff',
    '"git" diff',
    "'git' diff",
    'g\\it diff',
    'git "diff"',
    'git di""ff',
    '/usr/bin/git diff',
    'git --no-pager diff',
    'git -p diff',
    'git --git-dir .git diff',
    'git --no-optional-locks diff',
    '$(git diff)',
    '`git diff`',
    'cat <(git diff)',
    'cat <<EOF\n$(git diff)\nEOF',
    "bash -c 'git diff'",
    'sh -c "git diff"',
    'eval git diff',
    "env -S 'git diff'",
    'G=git; $G diff',
    'echo git diff',
  ]) {
    it(`Given ${JSON.stringify(command)}, when checked, then it blocks`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.equal(result.block, true);
    });
  }

  it('Given an unterminated heredoc body holding git diff, when checked, then it is data and passes', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('cat <<EOF\nbody\ngit diff');

    assert.equal(result.block, false);
  });
});

describe('gitExtDiffPredicate() — fail-closed verdicts', () => {
  for (const [command, reason] of [
    ['echo "x', 'craft: command not parseable (unterminated quote) — denied fail-closed'],
    ['echo $(x', 'craft: command not parseable (unterminated substitution) — denied fail-closed'],
    ['git -c alias.d=diff d', 'craft: an inline git alias (-c alias.*) is denied — it can run any git verb'],
  ]) {
    it(`Given ${JSON.stringify(command)}, when checked, then it blocks with the exact reason`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason });
    });
  }

  it('Given a dynamic word before the subcommand and a diff word, when checked, then it blocks', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('git $OPTS diff');

    assert.equal(result.block, true);
  });
});

describe('gitExtDiffPredicate() — accepted residuals', () => {
  for (const command of [
    "cat <<'EOF'\n$(git diff)\nEOF",
    'git${IFS}diff',
    'git --frobnicate diff',
  ]) {
    it(`Given ${JSON.stringify(command)}, when checked, then it passes`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.equal(result.block, false);
    });
  }
});

describe('gitExtDiffPredicate() — a subcommand carried by an expansion', () => {
  for (const command of ['D=diff; git $D', 'git $(echo show)', 'git -C . "$VERB"', 'D=diff; git $D HEAD']) {
    it(`Given "${command}", when checked, then it blocks with the ext-diff reason`, () => {
      const sut = gitExtDiffPredicate;

      const result = sut(command);

      assert.deepEqual(result, { block: true, reason: 'git diff/show must carry --no-ext-diff (external diff mangles parsed output)' });
    });
  }

  it('Given a dynamic subcommand and a literal --no-ext-diff, when checked, then it allows', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('D=diff; git $D --no-ext-diff');

    assert.deepEqual(result, { block: false });
  });

  it('Given a dynamic subcommand followed by a literal argument and --no-ext-diff, when checked, then it allows', () => {
    const sut = gitExtDiffPredicate;

    const result = sut('D=diff; git $D HEAD --no-ext-diff');

    assert.deepEqual(result, { block: false });
  });
});
