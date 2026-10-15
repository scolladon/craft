import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseShellCommands } from '../../src/guards/shell-tokeniser.js';

const dyn = text => ({ text, dynamic: true });
const word = text => ({ text, dynamic: false });
const cmd = (...texts) => ({ words: texts.map(word) });
const parsed = (...commands) => ({ parsed: true, commands });
const UNTERMINATED_QUOTE =
  'craft: command not parseable (unterminated quote) — denied fail-closed';

const assertParses = rows => {
  for (const [input, expected] of rows) {
    it(`Given ${JSON.stringify(input)}, When parsed, Then the simple commands are ${JSON.stringify(expected)}`, () => {
      const sut = parseShellCommands;

      const result = sut(input);

      assert.deepEqual(result, parsed(...expected.map(texts => cmd(...texts))));
    });
  }
};

describe('parseShellCommands() — command breaks', () => {
  assertParses([
    ['git -C x diff; ls', [['git', '-C', 'x', 'diff'], ['ls']]],
    ['a && b || c', [['a'], ['b'], ['c']]],
    ['a | b |& c', [['a'], ['b'], ['c']]],
    ['a & b', [['a'], ['b']]],
    ['a\nb', [['a'], ['b']]],
    ['(git diff)', [['git', 'diff']]],
    ['', []],
    ['  ', []],
  ]);
});

describe('parseShellCommands() — quoting and escapes', () => {
  assertParses([
    ["git -C '/a & b' diff", [['git', '-C', '/a & b', 'diff']]],
    ['git -C "/a;b" diff', [['git', '-C', '/a;b', 'diff']]],
    ['echo \\"; git diff', [['echo', '"'], ['git', 'diff']]],
    ["echo \\'; git diff", [['echo', "'"], ['git', 'diff']]],
    ["echo $'ab'; git diff", [['echo', 'ab'], ['git', 'diff']]],
    ['"git" diff', [['git', 'diff']]],
    ["'git' diff", [['git', 'diff']]],
    ['g\\it diff', [['git', 'diff']]],
    ['git "diff"', [['git', 'diff']]],
    ['git di""ff', [['git', 'diff']]],
    ['git \\\n diff', [['git', 'diff']]],
    ['echo "a\\$b\\x"', [['echo', 'a$b\\x']]],
  ]);
});

describe('parseShellCommands() — comments', () => {
  assertParses([
    ['git diff HEAD #--no-ext-diff', [['git', 'diff', 'HEAD']]],
    ['echo a#b', [['echo', 'a#b']]],
    ["git -c c='#0f0' diff", [['git', '-c', 'c=#0f0', 'diff']]],
    ['# only a comment', []],
    ['# c\ngit diff', [['git', 'diff']]],
  ]);
});

describe('parseShellCommands() — head words', () => {
  const gitDiff = ['git', 'diff'];
  for (const input of [
    'FOO=1 git diff',
    'FOO=1 BAR=2 git diff',
    '! git diff',
    'time git diff',
    'time -p git diff',
    '{ git diff; }',
    'if true; then git diff; fi',
    'while false; do git diff; done',
    'f(){ git diff; }; f',
    'case x in x) git diff;; esac',
  ]) {
    it(`Given ${JSON.stringify(input)}, When parsed, Then git diff is a command without head words`, () => {
      const sut = parseShellCommands;

      const result = sut(input);

      assert.deepEqual(
        result.commands.filter(command => command.words.some(w => w.text === 'git')),
        [cmd(...gitDiff)]
      );
    });
  }

  assertParses([
    ['git -c a=b diff', [['git', '-c', 'a=b', 'diff']]],
    ['echo FOO=1', [['echo', 'FOO=1']]],
  ]);
});

describe('parseShellCommands() — redirections', () => {
  assertParses([
    ['git diff > out.txt', [['git', 'diff']]],
    ['git diff >out.txt', [['git', 'diff']]],
    ['git diff 2>&1', [['git', 'diff']]],
    ['git diff &>/dev/null', [['git', 'diff']]],
    ['git diff >| f', [['git', 'diff']]],
    ['git diff <> f', [['git', 'diff']]],
    ['git diff >> f', [['git', 'diff']]],
    ['cat < in.txt', [['cat']]],
    ['>out git diff', [['git', 'diff']]],
    ['echo a>b c', [['echo', 'a', 'c']]],
  ]);
});

describe('parseShellCommands() — unterminated quotes', () => {
  for (const input of ['echo "x', "echo 'x", "echo $'x", 'echo "x\\']) {
    it(`Given ${JSON.stringify(input)}, When parsed, Then it is not parseable`, () => {
      const sut = parseShellCommands;

      const result = sut(input);

      assert.deepEqual(result, { parsed: false, reason: UNTERMINATED_QUOTE });
    });
  }
});

const wordOf = item => (typeof item === 'string' ? word(item) : item);
const cmdOf = items => ({ words: items.map(wordOf) });

const assertParsesWords = rows => {
  for (const [input, expected] of rows) {
    it(`Given ${JSON.stringify(input)}, When parsed, Then the simple commands are ${JSON.stringify(expected)}`, () => {
      const sut = parseShellCommands;

      const result = sut(input);

      assert.deepEqual(result, parsed(...expected.map(cmdOf)));
    });
  }
};

describe('parseShellCommands() — command substitution', () => {
  assertParsesWords([
    ['echo $(git diff)', [['git', 'diff'], ['echo', dyn('$(git diff)')]]],
    ['echo "$(git diff)"', [['git', 'diff'], ['echo', dyn('$(git diff)')]]],
    [
      'echo $(echo $(git diff))',
      [['git', 'diff'], ['echo', dyn('$(git diff)')], ['echo', dyn('$(echo $(git diff))')]],
    ],
    ['true && echo "x$(git diff)y"', [['true'], ['git', 'diff'], ['echo', dyn('x$(git diff)y')]]],
  ]);
});

describe('parseShellCommands() — backtick and process substitution', () => {
  assertParsesWords([
    ['echo `git diff`', [['git', 'diff'], ['echo', dyn('`git diff`')]]],
    [
      'echo $(echo `git diff`)',
      [['git', 'diff'], ['echo', dyn('`git diff`')], ['echo', dyn('$(echo `git diff`)')]],
    ],
    [
      'echo `echo \\`git diff\\``',
      [['git', 'diff'], ['echo', dyn('`git diff`')], ['echo', dyn('`echo \\`git diff\\``')]],
    ],
    ['cat <(git diff)', [['git', 'diff'], ['cat', dyn('<(git diff)')]]],
    ['tee >(git diff)', [['git', 'diff'], ['tee', dyn('>(git diff)')]]],
  ]);
});

describe('parseShellCommands() — dynamic words and expansions', () => {
  assertParsesWords([
    ['$G push', [[dyn('$G'), 'push']]],
    ['"$(which git)" push', [['which', 'git'], [dyn('$(which git)'), 'push']]],
    ['git -C "$WT" status', [['git', '-C', dyn('$WT'), 'status']]],
    ['echo ${x:-$(git diff)}', [['git', 'diff'], ['echo', dyn('${x:-$(git diff)}')]]],
    ['x=$((1+2)) git diff', [['git', 'diff']]],
    ['echo $((2*(3+4)))', [['echo', dyn('$((2*(3+4)))')]]],
    ["echo '$(git diff)'", [['echo', '$(git diff)']]],
    ["echo $'$(git diff)'", [['echo', '$(git diff)']]],
    ['echo \\$X', [['echo', '$X']]],
    ['git${IFS}diff', [[dyn('git${IFS}diff')]]],
    ['echo $1 $@ $* $# $? $$ $! $-', [['echo', ...['$1', '$@', '$*', '$#', '$?', '$$', '$!', '$-'].map(dyn)]]],
    ['echo "a $X b"', [['echo', dyn('a $X b')]]],
    ['echo "cost: $"', [['echo', 'cost: $']]],
  ]);
});

const UNTERMINATED_SUBSTITUTION =
  'craft: command not parseable (unterminated substitution) — denied fail-closed';

describe('parseShellCommands() — unterminated constructs', () => {
  const rows = [
    ['echo $(git diff', UNTERMINATED_SUBSTITUTION],
    ['echo `git diff', UNTERMINATED_SUBSTITUTION],
    ['echo ${x', UNTERMINATED_SUBSTITUTION],
    ['echo $((1+2', UNTERMINATED_SUBSTITUTION],
    ['cat <(git diff', UNTERMINATED_SUBSTITUTION],
    ['tee >(git diff', UNTERMINATED_SUBSTITUTION],
    ['echo "$(git diff', UNTERMINATED_SUBSTITUTION],
    ['git push\necho "x', UNTERMINATED_QUOTE],
    ['echo $(echo "x)', UNTERMINATED_QUOTE],
  ];
  for (const [input, reason] of rows) {
    it(`Given ${JSON.stringify(input)}, When parsed, Then it is not parseable`, () => {
      const sut = parseShellCommands;

      const result = sut(input);

      assert.deepEqual(result, { parsed: false, reason });
    });
  }
});

const PINNED_NESTING_CAP = 8;
const NESTING_TOO_DEEP = 'craft: command not parseable (nesting deeper than 8) — denied fail-closed';

const nest = depth =>
  depth === 0 ? 'git diff' : `echo $(${nest(depth - 1)})`;

describe('parseShellCommands() — nesting depth', () => {
  it('Given substitutions nested at the cap, When parsed, Then the innermost command is listed', () => {
    const sut = parseShellCommands;

    const result = sut(nest(PINNED_NESTING_CAP));

    assert.equal(result.parsed, true);
    assert.deepEqual(result.commands[0], cmd('git', 'diff'));
    assert.equal(result.commands.length, PINNED_NESTING_CAP + 1);
  });

  it('Given substitutions nested one past the cap, When parsed, Then it is not parseable', () => {
    const sut = parseShellCommands;

    const result = sut(nest(PINNED_NESTING_CAP + 1));

    assert.deepEqual(result, { parsed: false, reason: NESTING_TOO_DEEP });
  });

  it('Given parameter expansions nested one past the cap, When parsed, Then it is not parseable', () => {
    const sut = parseShellCommands;

    const result = sut(`${'echo ${x:-'.repeat(PINNED_NESTING_CAP + 1)}x${'}'.repeat(PINNED_NESTING_CAP + 1)}`);

    assert.deepEqual(result, { parsed: false, reason: NESTING_TOO_DEEP });
  });
});

describe('parseShellCommands() — heredoc bodies', () => {
  assertParses([
    ['cat <<EOF\nit\'s\nEOF\ngit diff', [['cat'], ['git', 'diff']]],
    ['cat <<EOF\n$(git diff)\nEOF', [['git', 'diff'], ['cat']]],
    ["cat <<'EOF'\n$(git push)\nEOF", [['cat']]],
    ['cat <<"EOF"\n$(git push)\nEOF', [['cat']]],
    ['cat <<\\EOF\n$(git push)\nEOF', [['cat']]],
    ['cat <<E"O"F\n$(git push)\nEOF', [['cat']]],
  ]);
});

describe('parseShellCommands() — heredoc variants', () => {
  assertParses([
    ['cat <<-EOF\n\tbody\n\tEOF\ngit diff', [['cat'], ['git', 'diff']]],
    ['cat <<EOF\nbody\ngit push', [['cat']]],
    ['cat <<A <<B\na\nA\nb\nB\ngit diff', [['cat'], ['git', 'diff']]],
  ]);

  it('Given the commit idiom with a quoted heredoc, When parsed, Then the apostrophe does not break parsing', () => {
    const sut = parseShellCommands;

    const result = sut('git commit -m "$(cat <<\'EOF\'\nfix: don\'t break (x)\nEOF\n)"');

    assert.deepEqual(
      result,
      parsed(cmd('cat'), cmdOf(['git', 'commit', '-m', dyn('$(cat <<\'EOF\'\nfix: don\'t break (x)\nEOF\n)')]))
    );
  });
});

describe('parseShellCommands() — here-strings', () => {
  assertParses([
    ['cat <<< "$(git diff)"', [['git', 'diff'], ['cat']]],
    ["cat <<< 'git diff'", [['cat']]],
    ['cat <<< word\ngit diff', [['cat'], ['git', 'diff']]],
  ]);
});

describe('parseShellCommands() — re-parsed shell -c strings', () => {
  assertParses([
    ["bash -c 'git diff'", [['bash', '-c', 'git diff'], ['git', 'diff']]],
    ['sh -lc "git diff"', [['sh', '-lc', 'git diff'], ['git', 'diff']]],
    ["/bin/zsh -ec 'git diff'", [['/bin/zsh', '-ec', 'git diff'], ['git', 'diff']]],
    ["env bash -c 'git diff; true'", [['env', 'bash', '-c', 'git diff; true'], ['git', 'diff'], ['true']]],
    ["bash -x -c 'git diff'", [['bash', '-x', '-c', 'git diff'], ['git', 'diff']]],
    ['bash script.sh', [['bash', 'script.sh']]],
  ]);

  assertParsesWords([
    [
      "bash -c '$(git diff)'",
      [['bash', '-c', '$(git diff)'], ['git', 'diff'], [dyn('$(git diff)')]],
    ],
  ]);
});

describe('parseShellCommands() — re-parsed eval and env -S strings', () => {
  assertParses([
    ['eval git diff', [['eval', 'git', 'diff'], ['git', 'diff']]],
    ["eval 'git diff; true'", [['eval', 'git diff; true'], ['git', 'diff'], ['true']]],
    ["eval echo 'a;' git diff", [['eval', 'echo', 'a;', 'git', 'diff'], ['echo', 'a'], ['git', 'diff']]],
    ["env -S 'git diff'", [['env', '-S', 'git diff'], ['git', 'diff']]],
    ["env --split-string='git diff'", [['env', '--split-string=git diff'], ['git', 'diff']]],
    ["env --split-string 'git diff'", [['env', '--split-string', 'git diff'], ['git', 'diff']]],
  ]);

  it('Given a re-parsed string at the nesting cap, When parsed, Then it is not parseable', () => {
    const sut = parseShellCommands;

    const result = sut(`bash -c '${nest(PINNED_NESTING_CAP)}'`);

    assert.deepEqual(result, { parsed: false, reason: NESTING_TOO_DEEP });
  });

  it('Given a too-deep re-parsed string inside a substitution, When parsed, Then it is not parseable', () => {
    const sut = parseShellCommands;

    const result = sut(`echo $(bash -c '${nest(PINNED_NESTING_CAP)}')`);

    assert.deepEqual(result, { parsed: false, reason: NESTING_TOO_DEEP });
  });
});

describe('parseShellCommands() — words the tokeniser does not compute', () => {
  const escaped = text => ({ text, dynamic: true, opaque: true });

  it('Given a $\'…\' word holding a backslash escape, When parsed, Then the word is dynamic and opaque', () => {
    const sut = parseShellCommands;

    const result = sut("echo $'a\\nb'");

    assert.deepEqual(result, parsed({ words: [word('echo'), escaped('anb')] }));
  });

  it('Given a $"…" word, When parsed, Then it reads as a double-quoted string', () => {
    const sut = parseShellCommands;

    const result = sut('$"git" push');

    assert.deepEqual(result, parsed(cmd('git', 'push')));
  });
});

const LENGTH_REASON =
  'craft: command not parseable (longer than the guard\'s limit) — denied fail-closed';
const MAX_COMMAND_LENGTH = 131072;

describe('shell parsing — bounded work', () => {
  it('Given a command longer than the limit, when parsed, then it is unparsed with the length reason', () => {
    const sut = parseShellCommands;

    const result = sut('a'.repeat(MAX_COMMAND_LENGTH + 1));

    assert.deepEqual(result, { parsed: false, reason: LENGTH_REASON });
  });

  it('Given a command exactly at the limit, when parsed, then it is parsed', () => {
    const sut = parseShellCommands;

    const result = sut('a'.repeat(MAX_COMMAND_LENGTH));

    assert.equal(result.parsed, true);
  });
});
