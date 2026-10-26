import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseShellCommands } from '../../src/guards/shell-tokeniser.js';

const dyn = text => ({ text, dynamic: true });
const word = text => ({ text, dynamic: false });
const cmd = (...texts) => ({ words: texts.map(word) });
const parsed = (...commands) => ({ parsed: true, commands });
const UNTERMINATED_QUOTE =
  'craft: command not parseable (unterminated quote) — denied fail-closed';
const ENV_RESPLIT =
  'craft: command not parseable (env -S re-splits its string with the words after it) — denied fail-closed';

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
    ["echo e=nv -S 'git diff'", [['echo', 'e=nv', '-S', 'git diff']]],
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
const LONG_WORD_LENGTH = 130000;
const OPEN_BRACKETS = '['.repeat(LONG_WORD_LENGTH);
// Far below the host's ~30 s hook timeout yet loose enough for coverage-instrumented CI runs.
const MAX_ELAPSED_MS = 3000;

const timed = work => {
  const start = performance.now();
  const result = work();
  return { result, elapsed: performance.now() - start };
};

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

  it('Given a long word of brackets holding a literal dollar, when parsed, then it finishes in bounded time', () => {
    const sut = parseShellCommands;

    const { elapsed } = timed(() => sut(`echo '$'${OPEN_BRACKETS}`));

    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a long run of brackets before a quote, when parsed, then it finishes in bounded time', () => {
    const sut = parseShellCommands;

    const { elapsed } = timed(() => sut(`echo ${OPEN_BRACKETS}]''`));

    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });

  it('Given a long word of single-quoted spans, when parsed, then it finishes in bounded time', () => {
    const sut = parseShellCommands;

    const { elapsed } = timed(() => sut(`echo ${"'a'".repeat(LONG_WORD_LENGTH / 3)}`));

    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });
});

const ARITHMETIC_HEREDOC =
  'craft: command not parseable (<< inside an arithmetic command) — denied fail-closed';
const OPAQUE_STRING =
  'craft: command not parseable (an escaped $\'…\' string is evaluated as shell) — denied fail-closed';

const patternWord = text => ({ text, dynamic: true, pattern: true });

const assertFails = rows => {
  for (const [input, reason] of rows) {
    it(`Given ${JSON.stringify(input)}, When parsed, Then it is not parseable for ${JSON.stringify(reason)}`, () => {
      const sut = parseShellCommands;

      const result = sut(input);

      assert.deepEqual(result, { parsed: false, reason });
    });
  }
};

describe('parseShellCommands() — head words stay out of the command', () => {
  assertParses([
    ['{ git diff; }', [['git', 'diff']]],
    ['! git diff', [['git', 'diff']]],
    ['time git diff', [['git', 'diff']]],
    ['if git diff; then git log; fi', [['git', 'diff'], ['git', 'log']]],
    ['if a; then b; elif c; then d; else e; fi', [['a'], ['b'], ['c'], ['d'], ['e']]],
    ['while git diff; do git log; done', [['git', 'diff'], ['git', 'log']]],
    ['until git diff; do git log; done', [['git', 'diff'], ['git', 'log']]],
    ['coproc git diff', [['git', 'diff']]],
    ['-p git diff', [['-p', 'git', 'diff']]],
    ['FOO=1 -p git diff', [['-p', 'git', 'diff']]],
    ['true; -p git diff', [['true'], ['-p', 'git', 'diff']]],
  ]);

  assertParses([['case x in x) git diff;; esac', [['x', 'in', 'x'], ['git', 'diff']]]]);

  it('Given an assignment before a command, When parsed, Then only the assignment is recorded on it', () => {
    const sut = parseShellCommands;

    const [first, second, third] = sut('git diff; FOO=1 BAR=2 git log; ! time git log').commands;

    assert.deepEqual([first, second, third].map(command => command.assignments), [[], ['FOO=1', 'BAR=2'], []]);
  });
});

describe('parseShellCommands() — shell words and literal operators', () => {
  assertParsesWords([
    ['[ -f x ]', [['[', '-f', 'x', ']']]],
    ['[[ a ]]', [['[[', 'a', ']]']]],
    ['echo *', [['echo', patternWord('*')]]],
    ["echo $'\\{'", [['echo', { text: '{', dynamic: false, opaque: true }]]],
  ]);

  assertParses([
    ["dash -c 'git diff'", [['dash', '-c', 'git diff'], ['git', 'diff']]],
    ["ksh -c 'git diff'", [['ksh', '-c', 'git diff'], ['git', 'diff']]],
    ['bash -x script.sh', [['bash', '-x', 'script.sh']]],
    ['bash x-c script.sh', [['bash', 'x-c', 'script.sh']]],
    ['bash -c1 script.sh', [['bash', '-c1', 'script.sh']]],
    ["bash +e -c 'git diff'", [['bash', '+e', '-c', 'git diff'], ['git', 'diff']]],
    ["bash -c 'git diff+'", [['bash', '-c', 'git diff+'], ['git', 'diff+']]],
  ]);
});

describe('parseShellCommands() — eval and env option runs', () => {
  assertParses([
    ['eval', [['eval']]],
    ['env -i git diff', [['env', '-i', 'git', 'diff']]],
    ["echo -S 'git diff'", [['echo', '-S', 'git diff']]],
    ['env --unset=FOO git diff', [['env', '--unset=FOO', 'git', 'diff']]],
    ["env -u env -S 'git diff'", [['env', '-u', 'env', '-S', 'git diff'], ['git', 'diff']]],
    [
      "bash script env -S 'git diff'",
      [['bash', 'script', 'env', '-S', 'git diff'], ['git', 'diff']],
    ],
  ]);

  for (const input of [
    "env -S 'git diff' env -S 'git log'",
    "env -S 'git show' --ext-diff",
    "env --split-string='git show' HEAD",
    'env -Sxargs git show',
    "env -S '' -S 'git show' --ext-diff",
    "env -S 'git show #' --ext-diff",
  ]) {
    it(`Given ${JSON.stringify(input)}, When parsed, Then env re-splitting with later words fails closed`, () => {
      const sut = parseShellCommands;

      const result = sut(input);

      assert.deepEqual(result, { parsed: false, reason: ENV_RESPLIT });
    });
  }

  it('Given a bare eval at the nesting cap, When parsed, Then it is parsed', () => {
    const sut = parseShellCommands;

    const result = sut(`${'echo $('.repeat(PINNED_NESTING_CAP)}eval${')'.repeat(PINNED_NESTING_CAP)}`);

    assert.equal(result.parsed, true);
  });

  assertFails([
    ['eval git $\'a\\nb\'', OPAQUE_STRING],
    ['( ((cat <<EOF))) ', ARITHMETIC_HEREDOC],
  ]);
});

describe('parseShellCommands() — brace expressions', () => {
  assertParsesWords([
    ['echo {a, b}', [['echo', '{a,', 'b}']]],
    ['echo {a,;}', [['echo', '{a,']]],
    ['echo {a,|}', [['echo', '{a,']]],
    ['echo {a,&}', [['echo', '{a,']]],
    ['echo {a,)}', [['echo', '{a,']]],
    ['echo {a,}', [['echo', patternWord('{a,}')]]],
    ['echo {a}', [['echo', '{a}']]],
    ['echo {a,b', [['echo', '{a,b']]],
    ['echo {a{b,c', [['echo', '{a{b,c']]],
    ['echo {a,"b c"}', [['echo', patternWord('{a,b c}')]]],
    ["echo {a,'b c'}", [['echo', patternWord('{a,b c}')]]],
    ['echo {a,"\\""}', [['echo', patternWord('{a,"}')]]],
    ['echo {a,\\ b}', [['echo', patternWord('{a, b}')]]],
    ['echo {a\\,b}', [['echo', '{a,b}']]],
    ["echo {a,'\\'}", [['echo', patternWord('{a,\\}')]]],
    ['echo {a\\..}', [['echo', '{a..}']]],
    ['echo {1..3}', [['echo', patternWord('{1..3}')]]],
  ]);

  for (const terminator of ['\t', '(', '<', '>']) {
    it(`Given a brace word cut by ${JSON.stringify(terminator)}, When parsed, Then it is not a brace expression`, () => {
      const sut = parseShellCommands;

      const result = sut(`echo {a,${terminator}}`);

      assert.equal(JSON.stringify(result).includes('"pattern"'), false);
    });
  }
});

describe('parseShellCommands() — escapes and dollars', () => {
  assertParsesWords([
    ['echo a\\', [['echo', 'a\\']]],
    ['echo "a\\\nb"', [['echo', 'ab']]],
    ['echo "a\\`b"', [['echo', 'a`b']]],
    ['echo "`git diff`"', [['git', 'diff'], ['echo', dyn('`git diff`')]]],
    ['echo $', [['echo', '$']]],
    ['echo "\'$X"', [['echo', dyn("'$X")]]],
    ['echo $(echo a #c\n)', [['echo', 'a'], ['echo', dyn('$(echo a #c\n)')]]],
    ['echo $( (git diff) | cat )', [['git', 'diff'], ['cat'], ['echo', dyn('$( (git diff) | cat )')]]],
  ]);

  it('Given a backtick at the nesting cap, When parsed, Then it is not parseable', () => {
    const sut = parseShellCommands;

    const result = sut(`${'echo $('.repeat(PINNED_NESTING_CAP)}echo \`git diff\`${')'.repeat(PINNED_NESTING_CAP)}`);

    assert.deepEqual(result, { parsed: false, reason: NESTING_TOO_DEEP });
  });
});

describe('parseShellCommands() — redirections and heredoc operators', () => {
  assertParses([
    ['echo >>(git diff)', [['echo'], ['git', 'diff']]],
    ['echo a &>f g', [['echo', 'a', 'g']]],
    ['echo a &>(git diff)', [['echo', 'a'], ['git', 'diff']]],
    ['cat <<<(git diff)', [['cat'], ['git', 'diff']]],
    ['echo 10>f', [['echo']]],
    ['echo a1>f', [['echo', 'a1']]],
    ['echo 1a>f', [['echo', '1a']]],
    ['cat 3<<EOF\nx\nEOF\ngit diff', [['cat'], ['git', 'diff']]],
    ['echo a<<EOF\nx\nEOF', [['echo', 'a']]],
    ['true && (cat <<EOF\nx\nEOF\n)', [['true'], ['cat']]],
    ['( (cat <<EOF\nx\nEOF\n) )\ngit diff', [['cat'], ['git', 'diff']]],
    ['cat <<EOF', [['cat']]],
    ['cat <<EOF\\', [['cat']]],
  ]);
});

describe('parseShellCommands() — heredoc delimiters and bodies', () => {
  assertParses([
    ['cat << EOF\nx\nEOF\ngit diff', [['cat'], ['git', 'diff']]],
    ['cat <<\tEOF\nx\nEOF\ngit diff', [['cat'], ['git', 'diff']]],
    ['cat <<\\EOF\nx\nEOF\ngit diff', [['cat'], ['git', 'diff']]],
    ["cat <<'E F'\nE F\ngit diff", [['cat'], ['git', 'diff']]],
    ['cat <<-EOF\n\t\tEOF\ngit diff', [['cat'], ['git', 'diff']]],
    ['cat <<-EOF\nE\tOF\ngit diff', [['cat']]],
    ['cat <<EOF\tgit diff\nEOF\ngit log', [['cat', 'git', 'diff'], ['git', 'log']]],
    ['cat <<EOF;git diff\nEOF\ngit log', [['cat'], ['git', 'diff'], ['git', 'log']]],
    ['cat <<EOF|git diff\nEOF\ngit log', [['cat'], ['git', 'diff'], ['git', 'log']]],
    ['cat <<EOF&git diff\nEOF\ngit log', [['cat'], ['git', 'diff'], ['git', 'log']]],
    ['cat <<EOF<in\nEOF\ngit log', [['cat'], ['git', 'log']]],
    ['cat <<EOF>out\nEOF\ngit log', [['cat'], ['git', 'log']]],
    ['cat <<EOF(git diff)\nEOF\ngit log', [['cat'], ['git', 'diff'], ['git', 'log']]],
    ['(cat <<EOF)\nEOF\ngit log', [['cat'], ['git', 'log']]],
  ]);

  assertFails([
    ["cat <<'EOF\nx", UNTERMINATED_QUOTE],
    ['echo `echo "x`', UNTERMINATED_QUOTE],
    ['cat <<EOF\n$(git diff\nEOF', UNTERMINATED_SUBSTITUTION],
  ]);
});

const HEREDOC_LIST_IN_SUBSTITUTION =
  'craft: command not parseable (a ; after a here-document inside $( ) or <( ) — bash 5.3 drops it) — denied fail-closed';
const FUNCTION_SUBSTITUTION_REFUSED =
  'craft: command not parseable (a bash 5.3 ${ …; } or ${| …; } function substitution) — denied fail-closed';

describe('parseShellCommands() — a semicolon after a heredoc inside a substitution body', () => {
  assertFails([
    ["echo $( cat <<'E'\nx\nE\nX=v; git show $X )", HEREDOC_LIST_IN_SUBSTITUTION],
    ['cat <( cat <<E\nx\nE\ntrue; git push )', HEREDOC_LIST_IN_SUBSTITUTION],
    ['echo "$( cat <<E\nx\nE\na; b )"', HEREDOC_LIST_IN_SUBSTITUTION],
    ['echo $( cat <<E\nx\nE\n( a; b ) )', HEREDOC_LIST_IN_SUBSTITUTION],
    ["bash -c 'echo $( cat <<E\nx\nE\na; b )'", HEREDOC_LIST_IN_SUBSTITUTION],
    ['cat <<F\n$( cat <<E\nx\nE\na; b )\nF', HEREDOC_LIST_IN_SUBSTITUTION],
    ['echo $( cat <<E; a\nx\nE\n)', HEREDOC_LIST_IN_SUBSTITUTION],
    ['echo $(cat <<E\nx\nE\na\nb; c)', HEREDOC_LIST_IN_SUBSTITUTION],
    ['echo ${ cat <<E\nx\nE\na; b; }', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo ${\tcat <<E\nx\nE\na; b; }', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo ${\ncat <<E\nx\nE\na; b; }', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo ${| cat <<E\nx\nE\na; b; }', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo "${ cat <<E\nx\nE\na; b; }"', FUNCTION_SUBSTITUTION_REFUSED],
  ]);

  assertParses([
    ['cat <<E\nx\nE\na; b', [['cat'], ['a'], ['b']]],
    ['(cat <<E\nx\nE\na; b)', [['cat'], ['a'], ['b']]],
  ]);

  assertParsesWords([
    ['echo `cat <<E\nx\nE\na; b`', [['cat'], ['a'], ['b'], ['echo', dyn('`cat <<E\nx\nE\na; b`')]]],
    ['echo $(cat <<E\nx\nE\na && b)', [['cat'], ['a'], ['b'], ['echo', dyn('$(cat <<E\nx\nE\na && b)')]]],
    ['echo $(cat <<E\nx\nE\na | b)', [['cat'], ['a'], ['b'], ['echo', dyn('$(cat <<E\nx\nE\na | b)')]]],
    ['echo $(cat <<E\nx\nE\na & b)', [['cat'], ['a'], ['b'], ['echo', dyn('$(cat <<E\nx\nE\na & b)')]]],
    ['echo $(cat <<E\nx\nE\na\nb)', [['cat'], ['a'], ['b'], ['echo', dyn('$(cat <<E\nx\nE\na\nb)')]]],
    ['echo $(a; cat <<E\nx\nE\n)', [['a'], ['cat'], ['echo', dyn('$(a; cat <<E\nx\nE\n)')]]],
    ['echo $(cat <<< x; a)', [['cat'], ['a'], ['echo', dyn('$(cat <<< x; a)')]]],
    ['echo $(echo $(cat <<E\nx\nE\n); a)', [['cat'], ['echo', dyn('$(cat <<E\nx\nE\n)')], ['a'], ['echo', dyn('$(echo $(cat <<E\nx\nE\n); a)')]]],
    ['echo $(cat <<E\nx\nE\necho $(a; b))', [['cat'], ['a'], ['b'], ['echo', dyn('$(a; b)')], ['echo', dyn('$(cat <<E\nx\nE\necho $(a; b))')]]],
    ['echo ${x:-<<E;}', [['x:-'], ['echo', dyn('${x:-<<E;}')]]],
    ['git commit -m "$(cat <<\'EOF\'\nfix: a; b\nEOF\n)"', [['cat'], ['git', 'commit', '-m', dyn('$(cat <<\'EOF\'\nfix: a; b\nEOF\n)')]]],
  ]);
});

const ARITHMETIC_SINGLE_QUOTE =
  "craft: command not parseable (a ' inside $(( )) or $[ ] — bash still runs the substitutions in it) — denied fail-closed";
const PUSH = ['git', 'push', '-f', 'origin'];
const nestArithmetic = depth => `echo ${'$(( '.repeat(depth)}1${' ))'.repeat(depth)}`;

describe('parseShellCommands() — substitutions inside an arithmetic expansion body', () => {
  assertParsesWords([
    ['echo $(($(git push -f origin)))', [PUSH, ['echo', dyn('$(($(git push -f origin)))')]]],
    ['echo $(( $(git push -f origin) + 1 ))', [PUSH, ['echo', dyn('$(( $(git push -f origin) + 1 ))')]]],
    ['echo $((`git push -f origin`))', [PUSH, ['echo', dyn('$((`git push -f origin`))')]]],
    ['echo "$(($(git push -f origin)))"', [PUSH, ['echo', dyn('$(($(git push -f origin)))')]]],
    ['cat <<E\n$(($(git push -f origin)))\nE', [PUSH, ['cat']]],
    ["bash -c 'echo $(($(git push -f origin)))'", [['bash', '-c', 'echo $(($(git push -f origin)))'], PUSH, ['echo', dyn('$(($(git push -f origin)))')]]],
    ['echo $(( $(( $(git push -f origin) )) ))', [PUSH, ['echo', dyn('$(( $(( $(git push -f origin) )) ))')]]],
    ['echo $(( ${x:-$(git push -f origin)} ))', [PUSH, ['echo', dyn('$(( ${x:-$(git push -f origin)} ))')]]],
    ['echo $(( a[$(git push -f origin)] ))', [PUSH, ['echo', dyn('$(( a[$(git push -f origin)] ))')]]],
    ['echo $(( $(cat <(git push -f origin)) ))', [PUSH, ['cat', dyn('<(git push -f origin)')], ['echo', dyn('$(( $(cat <(git push -f origin)) ))')]]],
    ['echo $(( $(cat <<E\nx\nE\ngit push -f origin) ))', [['cat'], PUSH, ['echo', dyn('$(( $(cat <<E\nx\nE\ngit push -f origin) ))')]]],
    ['echo $(( "$(git push -f origin)" ))', [PUSH, ['echo', dyn('$(( "$(git push -f origin)" ))')]]],
    ['echo $(( \\) $(git push -f origin) ))', [PUSH, ['echo', dyn('$(( \\) $(git push -f origin) ))')]]],
    ["echo $(( $(echo ')' ; git push -f origin) + 1 ))", [['echo', ')'], PUSH, ['echo', dyn("$(( $(echo ')' ; git push -f origin) + 1 ))")]]],
    ['echo $(( $(printf 3) + 1 ))', [['printf', '3'], ['echo', dyn('$(( $(printf 3) + 1 ))')]]],
    ['echo $(( "\'" $(git push -f origin) ))', [PUSH, ['echo', dyn('$(( "\'" $(git push -f origin) ))')]]],
  ]);
});

describe('parseShellCommands() — a $(( whose inner ) is not followed by ) is a command substitution', () => {
  assertParsesWords([
    ['echo $((git push -f origin) )', [PUSH, ['echo', dyn('$((git push -f origin) )')]]],
    ['echo $((git push -f origin); true)', [PUSH, ['true'], ['echo', dyn('$((git push -f origin); true)')]]],
    ['echo $((git push -f origin)|cat)', [PUSH, ['cat'], ['echo', dyn('$((git push -f origin)|cat)')]]],
    ['echo $((git push -f origin)\n)', [PUSH, ['echo', dyn('$((git push -f origin)\n)')]]],
    ['echo $(((git push -f origin)) )', [PUSH, ['echo', dyn('$(((git push -f origin)) )')]]],
  ]);
});

describe('parseShellCommands() — arithmetic expansion bodies bash does not run as commands', () => {
  assertParsesWords([
    ['echo $(( 16#ff ))', [['echo', dyn('$(( 16#ff ))')]]],
    ['echo $(( 1 << 2 ))', [['echo', dyn('$(( 1 << 2 ))')]]],
    ['echo $(( 1 <<E ))', [['echo', dyn('$(( 1 <<E ))')]]],
    ['echo $(( \\$(git push -f origin) ))', [['echo', dyn('$(( \\$(git push -f origin) ))')]]],
    ['echo $(( \\`git push -f origin\\` ))', [['echo', dyn('$(( \\`git push -f origin\\` ))')]]],
    ['echo $((git push -f origin))', [['echo', dyn('$((git push -f origin))')]]],
    ['echo $(( (git push -f origin) ))', [['echo', dyn('$(( (git push -f origin) ))')]]],
  ]);
});

describe('parseShellCommands() — quotes inside an arithmetic expansion body', () => {
  assertParsesWords([['echo $(( ")" + 1 ))', [['echo', dyn('$(( ")" + 1 ))')]]]]);

  assertFails([
    ["echo $(( '$(git push -f origin)' ))", ARITHMETIC_SINGLE_QUOTE],
    ["echo $(( '`git push -f origin`' ))", ARITHMETIC_SINGLE_QUOTE],
    ["echo $(( '${ git push -f origin; }' ))", ARITHMETIC_SINGLE_QUOTE],
    ["echo $(( '1' + 2 ))", ARITHMETIC_SINGLE_QUOTE],
    ["echo $(( $'1' + 1 ))", ARITHMETIC_SINGLE_QUOTE],
    ["echo $(( ')' + 1 ))", ARITHMETIC_SINGLE_QUOTE],
    ["echo $(( ')' $(git push -f origin) ))", ARITHMETIC_SINGLE_QUOTE],
    ["echo $((git push -f origin 'x') )", ARITHMETIC_SINGLE_QUOTE],
    ['echo $(( $(git push )', UNTERMINATED_SUBSTITUTION],
  ]);
});

describe('parseShellCommands() — arithmetic expansion nesting depth', () => {
  it('Given arithmetic expansions nested at the cap, When parsed, Then it is parsed', () => {
    const sut = parseShellCommands;

    const result = sut(nestArithmetic(PINNED_NESTING_CAP));

    assert.equal(result.parsed, true);
  });

  it('Given arithmetic expansions nested one past the cap, When parsed, Then it is not parseable', () => {
    const sut = parseShellCommands;

    const result = sut(nestArithmetic(PINNED_NESTING_CAP + 1));

    assert.deepEqual(result, { parsed: false, reason: NESTING_TOO_DEEP });
  });
});

describe('parseShellCommands() — dollar-bracket arithmetic bodies', () => {
  assertParsesWords([
    ['echo $[ 1 + 2 ]', [['echo', dyn('$[ 1 + 2 ]')]]],
    ['echo $[ a[1] + $(git push -f origin) ]', [PUSH, ['echo', dyn('$[ a[1] + $(git push -f origin) ]')]]],
    ['echo $[ $(git push -f origin) ]', [PUSH, ['echo', dyn('$[ $(git push -f origin) ]')]]],
    ['echo $[ "$(git push -f origin)" ]', [PUSH, ['echo', dyn('$[ "$(git push -f origin)" ]')]]],
    ['echo $[1<<2]\ngit push origin main', [['echo', dyn('$[1<<2]')], ['git', 'push', 'origin', 'main']]],
  ]);

  assertFails([
    ["echo $[ '$(git push -f origin)' ]", ARITHMETIC_SINGLE_QUOTE],
    ["echo \"$[ '$(git push -f origin)' ]\"", ARITHMETIC_SINGLE_QUOTE],
    ['echo $[ 1 + 2', UNTERMINATED_SUBSTITUTION],
    ['echo a$[b; git status', UNTERMINATED_SUBSTITUTION],
    ['echo "a$[b"; git status', UNTERMINATED_QUOTE],
  ]);
});

describe('parseShellCommands() — nested and unspaced dollar-bracket bodies', () => {
  assertParsesWords([
    ['echo $[ $[1] + 2 ]', [['echo', dyn('$[ $[1] + 2 ]')]]],
    ['echo $[$(git push -f origin)]', [PUSH, ['echo', dyn('$[$(git push -f origin)]')]]],
  ]);

  assertFails([
    ["echo $[ $[1] + '$(git push -f origin)' ]", ARITHMETIC_SINGLE_QUOTE],
    ['echo $[ 1 ); git status', UNTERMINATED_SUBSTITUTION],
  ]);
});

const SPLIT_EXPANSION =
  'craft: command not parseable (a line continuation inside $, ((, $(( or its closing )) ) — denied fail-closed';
const CONTINUATION = '\\\n';

describe('parseShellCommands() — line continuations inside an arithmetic opener or closer', () => {
  assertFails([
    [`echo $(( 1 #$(git push)\n)${CONTINUATION})`, SPLIT_EXPANSION],
    [`echo $(( 1 + 2 )${CONTINUATION}${CONTINUATION})`, SPLIT_EXPANSION],
    [`echo $(${CONTINUATION}( 1 #$(git push)\n))`, SPLIT_EXPANSION],
    [`echo $(${CONTINUATION}${CONTINUATION}(1))`, SPLIT_EXPANSION],
    [`echo $${CONTINUATION}(( 1 ))`, SPLIT_EXPANSION],
    [`echo $${CONTINUATION}[ 1 ]`, SPLIT_EXPANSION],
    [`echo "$${CONTINUATION}(git push)"`, SPLIT_EXPANSION],
    [`(${CONTINUATION}( '$(git push -f origin)' ))`, SPLIT_EXPANSION],
    [`for (${CONTINUATION}( i='$(git push -f origin)'; i<1; i++ )); do :; done`, SPLIT_EXPANSION],
    [`(${CONTINUATION}${CONTINUATION}( $'\\x24(git push -f origin)' ))`, SPLIT_EXPANSION],
  ]);

  assertParsesWords([
    [`echo $(${CONTINUATION}git status)`, [['git', 'status'], ['echo', dyn(`$(${CONTINUATION}git status)`)]]],
    [`echo $(( 1 + 2 ${CONTINUATION}))`, [['echo', dyn(`$(( 1 + 2 ${CONTINUATION}))`)]]],
    [`(${CONTINUATION} echo hi)`, [['echo', 'hi']]],
  ]);
});

const UNPAIRED_ARITHMETIC =
  'craft: command not parseable (a $(( )) body with unpaired parens — bash may re-read it as a command substitution) — denied fail-closed';
const BACKTICK = '`';

describe('parseShellCommands() — a $(( )) whose body does not pair its parens', () => {
  assertFails([
    ['echo $(( $(git push -f origin # )\n) ))', UNPAIRED_ARITHMETIC],
    [`echo $(( ${BACKTICK}printf g%st i #)${BACKTICK} push ))`, UNPAIRED_ARITHMETIC],
    [`echo $(( ${BACKTICK}printf git #)(${BACKTICK} push ))`, UNPAIRED_ARITHMETIC],
    [`echo $((""; ${BACKTICK}printf git #)(${BACKTICK} push;"" ))`, UNPAIRED_ARITHMETIC],
    [`echo $(( "\\""; ${BACKTICK}printf git #)(${BACKTICK} push;"" ))`, UNPAIRED_ARITHMETIC],
    ['echo $(( "$(echo ")")" # $(git push)\n ))', UNPAIRED_ARITHMETIC],
    ['echo $(( $(true # )\n) # $(git push)\n ))', UNPAIRED_ARITHMETIC],
    [`echo $(( ${BACKTICK}printf 1 #(${BACKTICK} ))`, UNPAIRED_ARITHMETIC],
  ]);

  assertParsesWords([
    ['echo $(((1)))', [['echo', dyn('$(((1)))')]]],
    ['echo $(( `echo 1` + 1 ))', [['echo', '1'], ['echo', dyn('$(( `echo 1` + 1 ))')]]],
    ['echo $(( "(" + 1 ))', [['echo', dyn('$(( "(" + 1 ))')]]],
    ['echo $(( "\\\n(" + 1 ))', [['echo', dyn('$(( "\\\n(" + 1 ))')]]],
    ["echo $(( $(echo 'a)') ))", [['echo', 'a)'], ['echo', dyn("$(( $(echo 'a)') ))")]]],
  ]);
});

const CASE_IN_SUBSTITUTION =
  'craft: command not parseable (case inside $( ), <( ) or >( ) — a pattern ) can close it) — denied fail-closed';

describe('parseShellCommands() — case inside a parenthesised substitution', () => {
  assertFails([
    ['echo $(case x in x) git push;; esac)', CASE_IN_SUBSTITUTION],
    ['echo "$(case x in x) git push;; esac)"', CASE_IN_SUBSTITUTION],
    ['echo $[ $(case x in x) git push;; esac) ]', CASE_IN_SUBSTITUTION],
    ['cat <(case x in x) git push;; esac)', CASE_IN_SUBSTITUTION],
    ['echo $(echo; case x in x) :;; esac)', CASE_IN_SUBSTITUTION],
    ['echo $( (case x in x) :;; esac) )', CASE_IN_SUBSTITUTION],
    ['echo $(case x in (x) git push;; esac)', CASE_IN_SUBSTITUTION],
    ['echo "$(case x in x|esac) git push;; esac)"', CASE_IN_SUBSTITUTION],
    ['echo "$(case y in (esac) ;; y) git push;; esac)"', CASE_IN_SUBSTITUTION],
    ['echo "$(function f case x in x) git push;; esac; f)"', CASE_IN_SUBSTITUTION],
    ['echo "$(function f { case x in x) git push;; esac; }; f)"', CASE_IN_SUBSTITUTION],
    ['echo "$(coproc f { case x in x) git push;; esac; })"', CASE_IN_SUBSTITUTION],
    ['echo $(echo case)', CASE_IN_SUBSTITUTION],
  ]);

  assertParsesWords([
    ['case x in x) git push;; esac', [['x', 'in', 'x'], ['git', 'push']]],
  ]);
});

describe('parseShellCommands() — bash 5.3 function substitutions are refused', () => {
  assertFails([
    ['echo "${ git status; }"', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo "${| REPLY=1\n}"', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo ${\tgit status; }', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo ${\ngit status; }', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo $((${ git push -f origin; }))', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo $((${| git push -f origin; }))', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo ${ : # <<E\ngit push\nE\n}', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo "${ echo }; git push; }"', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo $[ ${ echo }; git push; } ]', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo "${ x=1 }; git push; }"', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo "${ x=(a) }; git push; }"', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo "${ [[ a || } ]]; git push; }"', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo "${ case "}" in a|}) git push;; esac; }"', FUNCTION_SUBSTITUTION_REFUSED],
    ['echo "${ { echo; }; git push; }"', FUNCTION_SUBSTITUTION_REFUSED],
  ]);

  assertParsesWords([
    ['echo ${x}', [['echo', dyn('${x}')]]],
    ['echo ${x:-a b}', [['echo', dyn('${x:-a b}')]]],
    ['echo ${#x}', [['echo', dyn('${#x}')]]],
    ['echo ${x:-a case}', [['echo', dyn('${x:-a case}')]]],
  ]);
});

const QUOTED_ARITHMETIC_SUBSTITUTION =
  'craft: command not parseable (a quoted $( ), ` or ${ } inside (( )), a subscript or ${ } — bash may still run it) — denied fail-closed';
const opaqueWord = text => ({ text, dynamic: true, opaque: true });

describe('parseShellCommands() — a quoted substitution inside an arithmetic reach', () => {
  assertFails(
    [
      "(( '$(git push -f origin)' ))",
      "(( '`git push -f origin`' ))",
      "for (( i='$(git push -f origin)'; i<1; i++ )); do :; done",
      "a['$(git push -f origin)']=1",
      "x=abc; echo ${x:'$(git push -f origin)'}",
      "echo ${a['$(git push -f origin)']}",
      'echo "${a[\'$(git push -f origin)\']}"',
      "x=abc; echo ${x:1:'$(git push -f origin)'}",
      "x=abc; echo ${x: -'$(git push -f origin)'}",
      "echo ${@:'$(git push -f origin)'}",
      "a['$(git push -f origin)']+=1",
      "x=(); x['$(git push -f origin)']=1",
      "(( a['$(git push -f origin)'] ))",
      "(( '${ git push -f origin; }' ))",
      "(( '${x:-$(git push -f origin)}' ))",
      "a['`git push -f origin`']=1",
      "declare a['$(git push -f origin)']=1",
      "declare -A m; m['$(git push -f origin)']=1",
      "declare -A m; echo ${m['$(git push -f origin)']}",
      "echo ${x:-'$(git push -f origin)'}",
      "echo ${x:='$(git push -f origin)'}",
      "echo ${x/'$(git push -f origin)'/y}",
      "echo ${x::'$(git push -f origin)'}",
      "echo ${#a['$(git push -f origin)']}",
      'echo "${x:\'$(git push -f origin)\'}"',
      "(( '$(git diff HEAD)' ))",
      "(( $'$(git push -f origin)' ))",
      "for (( i=$'$(git push -f origin)'; i<1; i++ )); do :; done",
      "a[$'$(git push -f origin)']=1",
      "echo ${a[$'$(git push -f origin)']}",
      "x=abc; echo ${x:$'$(git push -f origin)'}",
      "(( $'\\x24(git push -f origin)' ))",
      "a[$'\\x24(git push -f origin)']=1",
      "(( $'\\x24' ))",
      "(( $'\\x60' ))",
      "(( $'\\44' ))",
      "(( $'\\044' ))",
      "(( $'\\140' ))",
      "(( $'\\u24' ))",
      "(( $'\\U00000024' ))",
      "(( $'\\x245' ))",
      "(( $'\\u0024' ))",
      "(( $'\\u00245' ))",
      "(( $'\\U000000245' ))",
      "(( $'\\444' ))",
      "(( $'\\540' ))",
      "(( $'$\\x28git push -f origin)' ))",
      "(( $'$\\50git push -f origin)' ))",
      "x=abc; echo ${x:$'$\\x7by:-$\\x28git push -f origin)}'}",
      "(( $'$\\x7b git push -f origin; }' ))",
      "(( $'\\x5b' ))",
      "a[1+'$(git push -f origin)']=1",
      "let x'[][''$(git push -f origin)'",
    ].map(input => [input, QUOTED_ARITHMETIC_SUBSTITUTION]),
  );
});

describe('parseShellCommands() — quotes that work in an arithmetic reach keep their shape', () => {
  assertParsesWords([
    ["(( '1' + 2 ))", [['1', '+', '2']]],
    ["a['1']=x", [[patternWord('a[1]=x')]]],
    ["declare -A m; m['k']=v", [['declare', '-A', 'm'], [patternWord('m[k]=v')]]],
    ['echo "${m[\'k\']}"', [['echo', dyn("${m['k']}")]]],
    ["echo ${x:-'default'}", [['echo', dyn("${x:-'default'}")]]],
    ["IFS=$'\\n'", []],
    ["echo $'\\033[1m'x", [['echo', opaqueWord('033[1mx')]]],
    ['echo "${v//$\'\\n\'/ }"', [['echo', dyn("${v//$'\\n'/ }")]]],
  ]);
});

describe('parseShellCommands() — ANSI-C escapes that decode to no opener', () => {
  assertParsesWords([
    ["(( $'\\x2' ))", [[opaqueWord('x2')]]],
    ["(( $'\\0044' ))", [[opaqueWord('0044')]]],
    ["(( $'\\033' ))", [[opaqueWord('033')]]],
    ["(( $'\\n' ))", [[opaqueWord('n')]]],
    ["(( $'\\e' ))", [[opaqueWord('e')]]],
    ["(( $'\\c$' ))", [[opaqueWord('c$')]]],
    ["(( $'\\\\x24' ))", [[opaqueWord('\\x24')]]],
    ["(( $'\\c\\x24' ))", [[opaqueWord('cx24')]]],
  ]);
});

const SUBSCRIPT_IN_STRING =
  'craft: command not parseable (a word holding a quoted [ … $( ) — bash may evaluate it as arithmetic and run it) — denied fail-closed';

describe('parseShellCommands() — a quoted subscript substitution in a word', () => {
  assertFails(
    [
      "let 'a[$(git push -f origin)]'",
      "[[ 'a[$(git push -f origin)]' -eq 0 ]]",
      "x='a[$(git push -f origin)]'; echo $(( x ))",
      "let 'x=a[$(git push -f origin)]'",
      "let 'a[`git push -f origin`]'",
      "let 'a[${x:-$(git push -f origin)}]'",
      "[[ 0 -lt 'a[$(git push -f origin)]' ]]",
      "[[ 1 -eq 1 && 'a[$(git push -f origin)]' -eq 0 ]]",
      "[[ ( 'a[$(git push -f origin)]' -eq 0 ) ]]",
      "declare -i x='a[$(git push -f origin)]'",
      "x='a[$(git push -f origin)]'; (( x ))",
      "x='a[$(git push -f origin)]'; [[ $x -eq 0 ]]",
      "x='a[$(git push -f origin)]'; let x",
      "x='a[$(git push -f origin)]'; echo ${y[x]}",
      "x='a[$(git push -f origin)]'; echo $(( $x ))",
      "x=$(printf '%s' 'a[$(git push -f origin)]'); echo $(( x ))",
      "read x <<< 'a[$(git push -f origin)]'; echo $(( x ))",
      "printf 'a[$(git push -f origin)]' > v; x=$(cat v); echo $(( x ))",
      "X='a[$(git push -f origin)]' bash -c 'echo $(( X ))'",
      "f() { echo $(( $1 )); }; f 'a[$(git push -f origin)]'",
      "let 'a[$(git diff HEAD)]'",
      "let 'a[b[1]+$(git push -f origin)]'",
      "let 'a[${ git push -f origin; }]'",
      "a[1]='$(git push -f origin)'",
      "[ 'a[$(git push -f origin)]' -eq 0 ]",
      "test 'a[$(git push -f origin)]' -eq 0",
      "[[ 'a[$(git push -f origin)]' == 0 ]]",
      "let 'a[1]+$(git push -f origin)'",
      "let '1+$(git push -f origin)' 'a[$(git push -f origin)]'",
      "x='a[$(git push -f origin)]'; echo \"$x\"",
      "awk '{ a[$1] = $(NF) } END { print 1 }' </dev/null && git push -f origin",
    ].map(input => [input, SUBSCRIPT_IN_STRING]),
  );
});

describe('parseShellCommands() — subscripts and openers that do not form a literal subscript substitution', () => {
  assertParsesWords([
    ["let '1+$(git push -f origin)'", [['let', '1+$(git push -f origin)']]],
    ["echo 'a['\"$(echo 1)\"']'", [['echo', '1'], ['echo', dyn('a[$(echo 1)]')]]],
    ["echo '$' a[$(echo 1)]", [['echo', '1'], ['echo', '$', patternWord('a[$(echo 1)]')]]],
    [
      "printf -v x 'a[%s]' '$(git push -f origin)'; echo $(( x ))",
      [['printf', '-v', 'x', 'a[%s]', '$(git push -f origin)'], ['echo', dyn('$(( x ))')]],
    ],
  ]);
});

describe('parseShellCommands() — an escaped opener in a word holding a subscript', () => {
  assertFails(
    [
      'let "a[\\$(git push -f origin)]"',
      'let "a[\\`git push -f origin\\`]"',
      'let a[\\$\\(git\\ push\\ -f\\ origin\\)]',
      'let a\\[\\$\\(git\\ push\\ -f\\ origin\\)\\]',
      '[[ "a[\\$(git push -f origin)]" -eq 0 ]]',
      '[[ a[\\$\\(git\\ push\\ -f\\ origin\\)] -eq 0 ]]',
      'x="a[\\$(git push -f origin)]"; echo $(( x ))',
      'x=a[\\$\\(git\\ push\\ -f\\ origin\\)]; echo $(( x ))',
      'x=a\\[\\$\\(git\\ push\\ -f\\ origin\\)\\]; echo $(( x ))',
      "let a[$\\(git' push -f origin'\\)]",
      "let 'a['$\\(git' push -f origin'\\)']'",
      "let a\\[$\\(git' push -f origin'\\)]",
      "let $'a\\x5b'$\\(git' push -f origin'\\)]",
      "let a[$\\{x:-$\\(git' push -f origin'\\)}]",
      "[[ a[$\\(git' push -f origin'\\)] -eq 1 ]]",
      "(( a[$\\(git' push -f origin'\\)] ))",
      "let a[${x:-$}\\(git' push -f origin'\\)]",
      "let a[{$,}\\(git' push -f origin'\\)]",
      "let a[{$,}'(git push -f origin)']",
      "let a[$(printf '$')\\(git' push -f origin'\\)]",
      "let a[`printf '$'`\\(git' push -f origin'\\)]",
      "(( a[${x:-$}\\(git' push -f origin'\\)] ))",
      "let a[${x:-$}\\`git' push -f origin'\\`]",
      "let a[${x:-$}\\{y}]",
      "let \"a[${x:-$}(git push -f origin)]\"",
      "printf \"[%s] ${c}(%s)\" a b",
    ].map(input => [input, SUBSCRIPT_IN_STRING]),
  );
});

describe('parseShellCommands() — an ANSI-C span holding an opener in a word holding a subscript', () => {
  assertFails(
    [
      "let $'a[$(git push -f origin)]'",
      "let $'a[\\x24(git push -f origin)]'",
      "x=$'a[\\x24(git push -f origin)]'; echo $(( x ))",
      "let $'a[\\44(git push -f origin)]'",
      "let $'a[\\x60git push -f origin\\x60]'",
      "let $'a[\\140git push -f origin\\140]'",
      "let $'a[\\x24\\x28git push -f origin)]'",
      "let $'a[\\u24(git push -f origin)]'",
      "let $'a[\\U00000024(git push -f origin)]'",
      "let $'a[\\x24]'",
      "let $'a\\x5b$(git push -f origin)]'",
      "let $'a\\133$(git push -f origin)]'",
      "let $'a\\u5b$(git push -f origin)]'",
      "let $'a\\x5b\\x24(git push -f origin)]'",
      "[[ $'a\\x5b$(git push -f origin)]' -eq 0 ]]",
      "x=$'a[\\444(git push -f origin)0]'; echo $(( x ))",
      "x=$'a[\\540git push -f origin\\5400]'; echo $(( x ))",
      "let $'a[$\\x28git push -f origin)]'",
      "let $'a[$\\50git push -f origin)]'",
      "let $'a[$\\x7b git push -f origin; }]'",
    ].map(input => [input, SUBSCRIPT_IN_STRING]),
  );
});

describe('parseShellCommands() — ANSI-C escapes that decode to no opener in a word holding a subscript', () => {
  assertParsesWords([
    ["let $'a[\\0044(git push -f origin)]'", [['let', opaqueWord('a[0044(git push -f origin)]')]]],
    ["let $'a[\\x2]'", [['let', opaqueWord('a[x2]')]]],
    ["let $'a[\\033]'", [['let', opaqueWord('a[033]')]]],
    ["let $'a[\\c$]'", [['let', opaqueWord('a[c$]')]]],
    ["echo $'\\x24' a[1]", [['echo', opaqueWord('x24'), patternWord('a[1]')]]],
    ["echo $'\\x28'", [['echo', opaqueWord('x28')]]],
    ["echo $'\\x5b'", [['echo', opaqueWord('x5b')]]],
    ["printf $'\\x5b%s\\x5d' x", [['printf', opaqueWord('x5b%sx5d'), 'x']]],
    ["echo $'\\x24' 'a[$x'", [['echo', opaqueWord('x24'), 'a[$x']]],
    ["echo $'\\x5b' '$x'", [['echo', opaqueWord('x5b'), '$x']]],
    ['sed "s/[ ]*$/x/;s/^/${PREFIX}/" f', [['sed', dyn('s/[ ]*$/x/;s/^/${PREFIX}/'), 'f']]],
    ['grep -E "[0-9]+$|${PAT}" f', [['grep', '-E', dyn('[0-9]+$|${PAT}'), 'f']]],
    ['echo "- [${t}](${u})"', [['echo', dyn('- [${t}](${u})')]]],
    ["jq '.[] | select(.id == $id)' f", [['jq', '.[] | select(.id == $id)', 'f']]],
  ]);
});
