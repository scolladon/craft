import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseGitArgv } from '../../src/guards/git-argv.js';

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

// Far below the host's ~30 s hook timeout yet loose enough for coverage-instrumented CI runs.
const MAX_ELAPSED_MS = 3000;

const timed = work => {
  const start = performance.now();
  const result = work();
  return { result, elapsed: performance.now() - start };
};

describe('git argv normalising — bounded work', () => {
  it('Given a long run of global flags before the subcommand, when normalised, then it finishes in bounded time', () => {
    const sut = normaliseGitArgv;
    const words = [...Array(15000).fill('--no-pager'), 'status'];

    const { result, elapsed } = timed(() => sut(words));

    assert.equal(result.subcommand, 'status');
    assert.ok(elapsed < MAX_ELAPSED_MS, `took ${elapsed} ms`);
  });
});
