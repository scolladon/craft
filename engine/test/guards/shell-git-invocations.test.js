import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseGitArgv, parseShellCommands } from '../../src/guards/shell-git-invocations.js';

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
    ["echo $'a\\'b'; git diff", [['echo', "a'b"], ['git', 'diff']]],
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
