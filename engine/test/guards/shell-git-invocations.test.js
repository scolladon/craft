import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gitDestructivePredicate } from '../../src/guards/git-destructive-predicate.js';
import { gitExtDiffPredicate } from '../../src/guards/git-ext-diff-predicate.js';
import { gitInvocations, hasInlineAlias, judgeParsed, normaliseGitArgv, parseShellCommands } from '../../src/guards/shell-git-invocations.js';

const dyn = text => ({ text, dynamic: true });

const subcommand = (name, args = [], configKeys = [], dynamicArgCount = 0) => ({
  kind: 'subcommand',
  subcommand: name,
  args,
  configKeys,
  dynamicArgCount,
});

describe('normaliseGitArgv() — value-taking global options', () => {
  for (const words of [
    ['-C', '.', 'push'],
    ['-c', 'k.v=1', 'push'],
    ['--git-dir=.git', 'push'],
    ['--git-dir', '.git', 'push'],
    ['--work-tree=.', 'push'],
    ['--work-tree', '.', 'push'],
    ['--namespace', 'x', 'push'],
    ['--config-env', 'k.v=HOME', 'push'],
    ['--attr-source=HEAD', 'push'],
  ]) {
    it(`Given ${JSON.stringify(words)}, when normalised, then the subcommand is push`, () => {
      const sut = normaliseGitArgv;

      const result = sut(words);

      assert.equal(result.kind, 'subcommand');
      assert.equal(result.subcommand, 'push');
      assert.deepEqual(result.args, []);
    });
  }

  it('Given a bare subcommand with arguments, when normalised, then args follow the subcommand', () => {
    const sut = normaliseGitArgv;

    const result = sut(['push', 'origin', 'main']);

    assert.deepEqual(result, subcommand('push', ['origin', 'main']));
  });

  it('Given -c with a mixed-case key, when normalised, then the key is lowercased', () => {
    const sut = normaliseGitArgv;

    const result = sut(['-c', 'Alias.P=push', 'p']);

    assert.deepEqual(result, subcommand('p', [], ['alias.p']));
  });

  it('Given --config-env= and -c without a value, when normalised, then keys are collected in order', () => {
    const sut = normaliseGitArgv;

    const result = sut(['--config-env=Clean.RequireForce=X', '-c', 'k', 'clean']);

    assert.deepEqual(result, subcommand('clean', [], ['clean.requireforce', 'k']));
  });

  it('Given --config-env with a separate value, when normalised, then its key is collected', () => {
    const sut = normaliseGitArgv;

    const result = sut(['--config-env', 'K.V=HOME', 'push']);

    assert.deepEqual(result, subcommand('push', [], ['k.v']));
  });

  it('Given dynamic words before and after --, when normalised, then only those before -- are counted', () => {
    const sut = normaliseGitArgv;

    const result = sut(['reset', dyn('$H'), '--', dyn('$P')]);

    assert.deepEqual(result, subcommand('reset', ['$H', '--', '$P'], [], 1));
  });
});

describe('normaliseGitArgv() — inherited object member names', () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    it(`Given the subcommand word ${name}, when normalised, then the subcommand is that string`, () => {
      const sut = normaliseGitArgv;

      const result = sut([name]);

      assert.equal(result.subcommand, name);
    });
  }
});

describe('normaliseGitArgv() — flag global options', () => {
  for (const flag of [
    '--no-pager',
    '-p',
    '--paginate',
    '-P',
    '--no-optional-locks',
    '--literal-pathspecs',
    '--glob-pathspecs',
    '--noglob-pathspecs',
    '--icase-pathspecs',
    '--no-replace-objects',
    '--no-lazy-fetch',
    '--no-advice',
    '--bare',
    '--exec-path=/x',
  ]) {
    it(`Given ${flag} before push, when normalised, then the flag is skipped`, () => {
      const sut = normaliseGitArgv;

      const result = sut([flag, 'push']);

      assert.deepEqual(result, subcommand('push'));
    });
  }
});

describe('normaliseGitArgv() — version, help and print-and-exit options', () => {
  it('Given -v followed by push, when normalised, then the subcommand is version with push as arg', () => {
    const sut = normaliseGitArgv;

    const result = sut(['-v', 'push']);

    assert.deepEqual(result, subcommand('version', ['push']));
  });

  it('Given --version, when normalised, then the subcommand is version', () => {
    const sut = normaliseGitArgv;

    const result = sut(['--version']);

    assert.deepEqual(result, subcommand('version'));
  });

  for (const flag of ['-h', '--help']) {
    it(`Given ${flag} before push, when normalised, then the subcommand is help`, () => {
      const sut = normaliseGitArgv;

      const result = sut([flag, 'push']);

      assert.deepEqual(result, subcommand('help', ['push']));
    });
  }

  for (const words of [
    ['--exec-path', 'push'],
    ['--html-path'],
    ['--man-path'],
    ['--info-path'],
    ['--list-cmds=builtins', 'push'],
    ['-C'],
    ['--git-dir'],
    ['-c', 'rev-parse'],
    [],
  ]) {
    it(`Given ${JSON.stringify(words)}, when normalised, then there is no subcommand`, () => {
      const sut = normaliseGitArgv;

      const result = sut(words);

      assert.deepEqual(result, { kind: 'no-subcommand' });
    });
  }
});

describe('normaliseGitArgv() — refused options', () => {
  for (const words of [
    ['-C.', 'push'],
    ['-ck.v=1', 'push'],
    ['--frobnicate', 'push'],
    ['--super-prefix=x/', 'push'],
    ['--', 'push'],
    ['--end-of-options', 'push'],
    ['--list-cmds', 'push'],
    ['--no-ext-diff', 'show', 'HEAD'],
  ]) {
    it(`Given ${JSON.stringify(words)}, when normalised, then the option is refused with the rest`, () => {
      const sut = normaliseGitArgv;

      const result = sut(words);

      assert.deepEqual(result, { kind: 'refused', option: words[0], rest: words.slice(1) });
    });
  }
});

describe('normaliseGitArgv() — dynamic words', () => {
  it('Given a dynamic word at option position, when normalised, then it is indeterminate from that word on', () => {
    const sut = normaliseGitArgv;

    const result = sut([dyn('$OPTS'), 'push']);

    assert.deepEqual(result, { kind: 'indeterminate', rest: ['$OPTS', 'push'] });
  });

  it('Given a dynamic option value, when normalised, then the value is consumed', () => {
    const sut = normaliseGitArgv;

    const result = sut(['-C', dyn('$WT'), 'status']);

    assert.deepEqual(result, subcommand('status'));
  });

  it('Given a dynamic word at subcommand position, when normalised, then it is indeterminate', () => {
    const sut = normaliseGitArgv;

    const result = sut(['-C', '.', dyn('$SUB')]);

    assert.deepEqual(result, { kind: 'indeterminate', rest: ['$SUB'] });
  });

  it('Given only dynamic words after the global options, when normalised, then it is indeterminate', () => {
    const sut = normaliseGitArgv;

    const result = sut([dyn('$A'), dyn('$B')]);

    assert.deepEqual(result, { kind: 'indeterminate', rest: ['$A', '$B'] });
  });
});

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
const LENGTH_REASON =
  'craft: command not parseable (longer than the guard\'s limit) — denied fail-closed';
const MAX_COMMAND_LENGTH = 131072;
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

  it('Given a long run of global flags before the subcommand, when normalised, then it finishes in bounded time', () => {
    const sut = normaliseGitArgv;
    const words = [...Array(15000).fill('--no-pager'), 'status'];

    const { result, elapsed } = timed(() => sut(words));

    assert.equal(result.subcommand, 'status');
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
