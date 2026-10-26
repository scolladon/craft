import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { normaliseGitArgv } from '../../src/guards/git-argv.js';
import {
  FALSE_BLOCK_TAGS,
  ORIGINAL_PATH,
  PARSE_FAILURE_TAGS,
  SANITY_BASH,
  SPAWN_TIMEOUT_MS,
  SYNTAX_EXEMPT_TAGS,
  TAGS,
  findOnPath,
  generateCommands,
  mapPool,
  mulberry32,
  oracleVerdict,
  pick,
  runInShell,
  secondBash,
  withTree,
  judgeArgv,
} from '../../test-helpers/git-differential-harness.js';
import { gitInvocations } from '../../src/guards/shell-git-invocations.js';
import { gitDestructivePredicate } from '../../src/guards/git-destructive-predicate.js';
import { gitExtDiffPredicate } from '../../src/guards/git-ext-diff-predicate.js';

// Maintainers can scale the fuzz on demand: GUARD_FUZZ_SEEDS=1,2,3 (comma list) and GUARD_FUZZ_COUNT=2000 override these defaults, which keep CI under five seconds.
const parseSeeds = text => text.split(',').map(Number);
const SEEDS = Object.freeze(process.env.GUARD_FUZZ_SEEDS ? parseSeeds(process.env.GUARD_FUZZ_SEEDS) : [20260]);
const CAP = Number(process.env.GUARD_FUZZ_COUNT ?? 400);
const LEG_B_SHARE = 0.375;
const LEG_B_CAP = Math.round(CAP * LEG_B_SHARE);
const INVOKED_FLOOR = CAP / 2;
const FUZZ_TIMEOUT_MS = 60_000;
const STRICT_GIT_VERSION = /^git version 2\.54\./;
const SENTINEL_SUBCOMMAND = 'rev-parse';
const MAX_LEG_B_OPTIONS = 4;
const SYNTAX_ERROR = /syntax error|unexpected EOF/;
// bash 3.2 cannot match the closing paren of a $(...) that holds a comment, a heredoc or an odd quote inside a heredoc body:
// it runs nothing, so the predicates' conservative block is not a false block.
const SHELL_REJECTED = /bad substitution/;

const predicateVerdict = command => ({ destructive: gitDestructivePredicate(command).block, extDiff: gitExtDiffPredicate(command).block });

// A false block is judged on the union: an indeterminate command is denied fail-closed by both predicates.
const anyBlocks = verdict => verdict.destructive || verdict.extDiff;

function problemsOf(entry, run) {
  const problems = [];
  const predicate = predicateVerdict(entry.text);
  const oracle = oracleVerdict(run.argvs);
  const tagged = tag => entry.tags.includes(tag);
  const falseAllows = ['destructive', 'extDiff'].filter(kind => oracle[kind] && !predicate[kind]);
  const falseBlock = anyBlocks(predicate) && !anyBlocks(oracle);
  if (run.signal !== null) problems.push(`shell was killed (${run.signal})`);
  if (SYNTAX_ERROR.test(run.stderr) && !SYNTAX_EXEMPT_TAGS.some(tagged)) problems.push(`generator emitted invalid shell: ${run.stderr.trim().replaceAll('\n', ' / ')}`);
  if (falseAllows.length > 0) problems.push(`FALSE ALLOW (${falseAllows.join(', ')}): bash ran a blocked git argv and the predicate allowed it`);
  if (!gitInvocations(entry.text).parsed && !PARSE_FAILURE_TAGS.some(tagged)) problems.push('parsed:false on a command that is not unterminated or over-nested');
  if (falseBlock && !SHELL_REJECTED.test(run.stderr) && !FALSE_BLOCK_TAGS.some(tagged)) problems.push('unexpected false block (no intended-false-block class)');
  return problems;
}

function judgeRun(entry, run) {
  const predicate = predicateVerdict(entry.text);
  const oracle = oracleVerdict(run.argvs);
  const falseBlock = anyBlocks(predicate) && !anyBlocks(oracle);
  return {
    problems: problemsOf(entry, run),
    invoked: run.argvs.length > 0,
    falseBlockTags: falseBlock ? entry.tags.filter(tag => FALSE_BLOCK_TAGS.includes(tag)) : [],
  };
}

async function fuzzShell(shell, commands) {
  return withTree(async tree => {
    const runs = await mapPool(commands, (entry, index) => runInShell(shell, entry.text, tree, index));
    return commands.map((entry, index) => judgeRun(entry, runs[index]));
  });
}

const failureReport = (commands, verdicts) =>
  verdicts
    .flatMap((verdict, index) => verdict.problems.map(problem => `${problem} :: ${JSON.stringify(commands[index].text)}`))
    .join('\n');

function countBy(items) {
  return items.reduce((counts, item) => ({ ...counts, [item]: (counts[item] ?? 0) + 1 }), {});
}

// ---------------------------------------------------------------- Leg B

const VALUE_CHOICES = Object.freeze({
  '-C': ['.', 'x', 'x', '/x', 'HEAD'],
  '-c': ['k.v=1', 'k.v=HOME', 'k.v'],
  '--git-dir': ['.git', '.git', 'x', '/x'],
  '--work-tree': ['.', 'x'],
  '--namespace': ['x', 'k.v=1'],
  '--config-env': ['k.v=HOME', 'k.v=1'],
  '--attr-source': ['HEAD', 'x'],
});
const LEG_B_FLAGS = Object.freeze([
  '--no-pager', '-p', '-P', '--paginate', '--no-optional-locks', '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs',
  '--icase-pathspecs', '--no-replace-objects', '--no-lazy-fetch', '--no-advice', '--bare', '--exec-path=x', '--exec-path',
  '--html-path', '--list-cmds=main',
]);
const LEG_B_INVALID = Object.freeze([['--frobnicate'], ['-C.'], ['--'], ['--super-prefix=x/'], ['--list-cmds']]);

function valueOption(rng) {
  const name = pick(rng, Object.keys(VALUE_CHOICES));
  const value = pick(rng, VALUE_CHOICES[name]);
  if (name === '-C' || name === '-c' || rng() < 0.5) return [name, value];
  return [`${name}=${value}`];
}

function legBOption(rng) {
  const choice = rng();
  if (choice < 0.4) return valueOption(rng);
  if (choice < 0.8) return [pick(rng, LEG_B_FLAGS)];
  return pick(rng, LEG_B_INVALID);
}

function legBSequences(seed, cap) {
  const rng = mulberry32(seed);
  return Array.from({ length: cap }, () => {
    const options = Array.from({ length: 1 + Math.floor(rng() * MAX_LEG_B_OPTIONS) }, () => legBOption(rng)).flat();
    return Object.freeze([...options, SENTINEL_SUBCOMMAND]);
  });
}

const TRACE_BUILTIN = /trace: built-in: git (\S+)/;
const UNKNOWN_OPTION = /unknown option/;
const FATAL = /^(fatal|error):/m;

function classifyTrace(stderr) {
  const ran = TRACE_BUILTIN.exec(stderr);
  if (ran) return { kind: 'subcommand', subcommand: ran[1] };
  if (UNKNOWN_OPTION.test(stderr)) return { kind: 'refused' };
  if (FATAL.test(stderr)) return { kind: 'died' };
  return { kind: 'no-subcommand' };
}

function makeRepo(gitPath, tree) {
  const env = { PATH: ORIGINAL_PATH, HOME: tree.home, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  const run = args => execFileSync(gitPath, args, { cwd: tree.repo, env, stdio: 'ignore' });
  run(['init', '-q']);
  run(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'e']);
  mkdirSync(join(tree.repo, 'x'));
  return env;
}

function runGit(gitPath, argv, tree, baseEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(gitPath, argv, { cwd: tree.repo, env: { ...baseEnv, GIT_TRACE: '1' }, stdio: ['ignore', 'ignore', 'pipe'], timeout: SPAWN_TIMEOUT_MS });
    const stderr = [];
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', () => resolve(classifyTrace(Buffer.concat(stderr).toString())));
  });
}

const UNSAFE_MISMATCH = (git, normalised) =>
  git.kind === 'subcommand' && (normalised.kind !== 'subcommand' || normalised.subcommand !== git.subcommand);

function legBProblem(git, normalised, strict) {
  if (git.kind === 'died') return null;
  if (!strict) return UNSAFE_MISMATCH(git, normalised) ? 'git ran a subcommand the normaliser did not report' : null;
  const sameKind = git.kind === normalised.kind;
  const sameSubcommand = git.kind !== 'subcommand' || git.subcommand === normalised.subcommand;
  return sameKind && sameSubcommand ? null : 'normaliser disagrees with git';
}

const COMMANDS_BY_SEED = SEEDS.map(seed => ({ seed, commands: generateCommands(seed, CAP) }));
const SECOND_BASH = secondBash();

describe('shell-git-invocations — Leg B comparison rule', () => {
  const subcommand = name => ({ kind: 'subcommand', subcommand: name });
  const rows = [
    ['agree on the subcommand, strict', subcommand('rev-parse'), subcommand('rev-parse'), true, null],
    ['disagree on the subcommand, strict', subcommand('rev-parse'), subcommand('push'), true, 'normaliser disagrees with git'],
    ['disagree on the subcommand, unsafe-direction', subcommand('rev-parse'), subcommand('push'), false, 'git ran a subcommand the normaliser did not report'],
    ['agree on refused, strict', { kind: 'refused' }, { kind: 'refused' }, true, null],
    ['git refused but the normaliser reports a subcommand, strict', { kind: 'refused' }, subcommand('rev-parse'), true, 'normaliser disagrees with git'],
    ['git refused but the normaliser reports a subcommand, unsafe-direction', { kind: 'refused' }, subcommand('rev-parse'), false, null],
    ['git ran a subcommand the normaliser refused, strict', subcommand('rev-parse'), { kind: 'refused' }, true, 'normaliser disagrees with git'],
    ['git ran a subcommand the normaliser refused, unsafe-direction', subcommand('rev-parse'), { kind: 'refused' }, false, 'git ran a subcommand the normaliser did not report'],
    ['agree on no-subcommand, strict', { kind: 'no-subcommand' }, { kind: 'no-subcommand' }, true, null],
    ['git ran nothing but the normaliser reports a subcommand, strict', { kind: 'no-subcommand' }, subcommand('push'), true, 'normaliser disagrees with git'],
    ['git ran nothing but the normaliser reports a subcommand, unsafe-direction', { kind: 'no-subcommand' }, subcommand('push'), false, null],
    ['git ran a subcommand the normaliser found none for, strict', subcommand('rev-parse'), { kind: 'no-subcommand' }, true, 'normaliser disagrees with git'],
    ['git died, strict', { kind: 'died' }, subcommand('push'), true, null],
    ['git died, unsafe-direction', { kind: 'died' }, { kind: 'refused' }, false, null],
  ];
  for (const [name, git, normalised, strict, expected] of rows) {
    it(`Given ${name}, when compared, then the verdict is ${expected ?? 'agreement'}`, () => {
      const sut = legBProblem;

      const result = sut(git, normalised, strict);

      assert.equal(result, expected);
    });
  }
});

describe('shell-git-invocations — differential fuzz against bash and git', { concurrency: true }, () => {
  it('Given the fixed seeds, when the commands are generated twice, then both lists are identical', () => {
    const sut = generateCommands;

    for (const { seed, commands } of COMMANDS_BY_SEED) {
      const result = sut(seed, CAP).map(entry => entry.text);

      assert.deepEqual(result, commands.map(entry => entry.text));
      assert.equal(result.length, CAP);
    }
  });

  it('Given the generated commands, when their tags are counted, then every false-block class and the residual class is reached', () => {
    const sut = COMMANDS_BY_SEED.flatMap(({ commands }) => commands);

    const result = countBy(sut.flatMap(entry => entry.tags));

    for (const tag of Object.values(TAGS)) assert.ok((result[tag] ?? 0) > 0, `generator never reached ${tag}`);
  });

  for (const { seed, commands } of COMMANDS_BY_SEED) {
    for (const [name, shell] of [['/bin/bash', SANITY_BASH], ['the first bash >= 5 on PATH', SECOND_BASH]]) {
      it(
        `Given every command of seed ${seed}, when ${name} runs it against a stub git, then the predicates never allow what bash ran`,
        { timeout: FUZZ_TIMEOUT_MS, skip: shell === null ? 'no second bash >= 5 on PATH' : false },
        async t => {
          const sut = fuzzShell;

          const result = await sut(shell, commands);

          const invoked = result.filter(verdict => verdict.invoked).length;
          t.diagnostic(`generated ${commands.length}, invoked ${invoked}, false blocks ${JSON.stringify(countBy(result.flatMap(verdict => verdict.falseBlockTags)))}`);
          const report = failureReport(commands, result);
          assert.ok(report === '', `\n${report}`);
          assert.ok(invoked >= INVOKED_FLOOR, `only ${invoked} commands logged a git argv`);
        }
      );
    }

    it(
      `Given random sequences of git global options from seed ${seed}, when real git traces them, then the normaliser never misses the subcommand git ran`,
      { timeout: FUZZ_TIMEOUT_MS },
      async t => {
        const gitPath = findOnPath('git');
        const strict = STRICT_GIT_VERSION.test(execFileSync(gitPath, ['--version'], { encoding: 'utf8' }));
        const sequences = legBSequences(seed, LEG_B_CAP);

        const outcomes = await withTree(async tree => {
          const env = makeRepo(gitPath, tree);
          return mapPool(sequences, async argv => ({ argv, git: await runGit(gitPath, argv, tree, env) }));
        });

        const problems = outcomes
          .map(({ argv, git }) => ({ argv, problem: legBProblem(git, normaliseGitArgv(argv), strict) }))
          .filter(({ problem }) => problem !== null)
          .map(({ argv, problem }) => `${problem}: git ${JSON.stringify(argv)}`);
        t.diagnostic(`strict ${strict}, git outcomes ${JSON.stringify(countBy(outcomes.map(({ git }) => git.kind)))}`);
        assert.deepEqual(problems, []);
        const kinds = new Set(outcomes.map(({ git }) => git.kind));
        for (const kind of ['subcommand', 'refused', 'no-subcommand']) assert.ok(kinds.has(kind), `Leg B never reached ${kind}`);
      }
    );
  }
});

const PINNED_SEEDS = Object.freeze([101, 202, 303, 404, 505, 11, 22, 33, 44, 55, 66, 77, 88, 99, 111]);
const PINNED_COUNT = 1500;
const PIPE_INTO_FUNCTION = /(?:^|[^|])\| f\(\) \{/;
const PIPE_INTO_ASSIGNMENT_LIST = /(?:^|[^|])\| [A-Za-z_]\w*=[^ ;|&]*; /;
const TIME_AFTER_CASE_PATTERN = /in \(x\) time /;
const SPLIT_TIME = /env -S 'time /;
const TIME_BEFORE_COMPOUND = /\btime time (?:if |\(|\{|case |for )/;
const ECHOED_NEGATION_SHORT_CIRCUIT = /(?:echo \$\(|cat <\() ! \{ .*; \} \) \|\| /;
const PIPED_SIGPIPE_WRITER = /git push' \| /;
const FAILING_LEFT_AND = /(?:ls \*\.md|bash -lc 'git status') && /;
// A quoted heredoc keeps its body as data, also when the whole text sits inside a single-quoted eval or bash -c string.
const QUOTED_HEREDOC = /<<(?:['"]|'\\'')EOF/;
const WHOLE_COMMAND_REJECTED = /<<'EOFQ'/;
const BRACE_IN_PROCESS_SUBSTITUTION = /cat <\( (?:(?!\)[' ])[^\n])*\{[^{}\s]*(,|\.\.)[^{}\s]*\}/;
const QUOTED_HEREDOC_AROUND_UNTERMINATED =
  /<<(['"])EOF\d+\1\n(?:(?!\n\t?EOF\d)[\s\S])*(git push 'x|git status "x|echo \$\(git push)/;
const LITERAL_SUBSCRIPT_SPECIAL = /a\[\$\(git push origin\)\]/;
const CASE_REFUSAL = /case inside \$\( \)/;
// No paren between the opener and the heredoc, nor between its terminator and the ;, so all three share one substitution body.
const HEREDOC_LIST_IN_SUBSTITUTION = /(?:\$\(|<\() [^()\n]*?<<-?(['"]?)(EOF\w+)\1\n[\s\S]*?\n\t?\2\n[^()\n]*;/;

const pinnedCommands = () => PINNED_SEEDS.flatMap(seed => generateCommands(seed, PINNED_COUNT));
const offenders = (entries, ...patterns) => entries.filter(entry => patterns.some(pattern => pattern.test(entry.text))).map(entry => entry.text);

describe('shell-git-invocations — generator composition at scale', () => {
  it('Given any seed, when commands are generated, then the firing show and brace spellings are fixed entries', () => {
    const sut = generateCommands;
    const expected = [
      'X=--ext-diff; git show $X',
      'G=git; command $G {di,show}ff',
      'G="git diff"; $G show',
      'D=". diff"; git -C $D show',
      'echo --ext-diff | xargs git show',
      "echo $( cat <<'EOFH'\nx\nEOFH\nX=--ext-diff; git show $X )",
    ];

    const result = sut(1, 100).map(entry => entry.text);

    assert.deepEqual(expected.filter(text => !result.includes(text)), []);
  });

  it('Given any seed, when commands are generated, then the arithmetic-body substitution spellings are fixed entries', () => {
    const sut = generateCommands;
    const expected = ['echo $(( $(git push origin) + 1 ))', 'echo $((git push origin) )'];

    const result = sut(1, 100).map(entry => entry.text);

    assert.deepEqual(expected.filter(text => !result.includes(text)), []);
  });

  it('Given any seed, when commands are generated, then the quoted arithmetic and subscript substitution spellings are fixed entries', () => {
    const sut = generateCommands;
    const expected = [
      "let 'a[$(git push origin)]'",
      "[[ 'a[$(git push origin)]' -eq 0 ]]",
      "x='a[$(git push origin)]'; echo $(( x ))",
      "(( '$(git push origin)' ))",
      "echo ${a['$(git push origin)']}",
      "x=abc; echo ${x:'$(git push origin)'}",
      "let 'a[1]+$(git push origin)'",
    ];

    const result = sut(1, 100).map(entry => entry.text);

    assert.deepEqual(expected.filter(text => !result.includes(text)), []);
  });

  it('Given the pinned seeds at scale, when generated, then the argv-appender tag sits only on xargs-wrapped commands and not on all of them', () => {
    const sut = pinnedCommands;
    const isTagged = entry => entry.tags.includes('argv-appender');

    const entries = sut();
    const ledByWrapper = entries.filter(entry => entry.text.startsWith('echo x | xargs '));
    const result = {
      taggedWithoutXargs: entries.filter(entry => isTagged(entry) && !entry.text.includes('xargs ')).length,
      ledTagged: ledByWrapper.some(isTagged),
      ledUntagged: ledByWrapper.some(entry => !isTagged(entry)),
    };

    assert.deepEqual(result, { taggedWithoutXargs: 0, ledTagged: true, ledUntagged: true });
  });

  it('Given the pinned seeds at scale, when generated, then no pipeline element is an unbraced function definition or assignment-led list', () => {
    const sut = pinnedCommands;

    const result = offenders(sut(), PIPE_INTO_FUNCTION, PIPE_INTO_ASSIGNMENT_LIST);

    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then no left element can kill or skip the git on its right', () => {
    const sut = pinnedCommands;

    const result = offenders(sut(), PIPED_SIGPIPE_WRITER, FAILING_LEFT_AND);

    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then time is never led by a case pattern or split by env -S', () => {
    const sut = pinnedCommands;

    const result = offenders(sut(), TIME_AFTER_CASE_PATTERN, SPLIT_TIME);

    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then time never directly precedes another time that leads a compound command', () => {
    const sut = pinnedCommands;

    const result = offenders(sut(), TIME_BEFORE_COMPOUND);

    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then a negation echoed or catted is never modelled as failing before an or-list', () => {
    const sut = pinnedCommands;

    const result = offenders(sut(), ECHOED_NEGATION_SHORT_CIRCUIT);

    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then every brace word inside cat process substitution carries the brace-in-process-substitution tag', () => {
    const sut = pinnedCommands;

    const result = sut()
      .filter(entry => BRACE_IN_PROCESS_SUBSTITUTION.test(entry.text) && !QUOTED_HEREDOC.test(entry.text))
      .filter(entry => !entry.tags.includes('brace-in-process-substitution'))
      .map(entry => entry.text);

    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then every quoted heredoc around an unterminated special carries the quote-in-heredoc-body tag', () => {
    const sut = pinnedCommands;

    const result = sut()
      .filter(entry => QUOTED_HEREDOC_AROUND_UNTERMINATED.test(entry.text))
      .filter(entry => !entry.tags.includes('quote-in-heredoc-body'))
      .map(entry => entry.text);

    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then every command holding a literal subscript special carries the literal-subscript-substitution tag', () => {
    const sut = pinnedCommands;

    const result = sut()
      .filter(entry => LITERAL_SUBSCRIPT_SPECIAL.test(entry.text))
      .filter(entry => !entry.tags.includes('literal-subscript-substitution'))
      .map(entry => entry.text);

    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then every heredoc followed by a semicolon inside a substitution carries the heredoc-list-in-substitution tag', () => {
    const sut = pinnedCommands;

    const entries = sut().filter(entry => HEREDOC_LIST_IN_SUBSTITUTION.test(entry.text));
    const result = entries.filter(entry => !entry.tags.includes('heredoc-list-in-substitution')).map(entry => entry.text);

    assert.ok(entries.length > 0, 'the pinned seeds never built the construct');
    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then every command tagged heredoc-list-in-substitution is refused by the parser', () => {
    const sut = gitInvocations;

    const entries = pinnedCommands().filter(entry => entry.tags.includes('heredoc-list-in-substitution'));
    const result = entries.filter(entry => sut(entry.text).parsed !== false).map(entry => entry.text);

    assert.ok(entries.length > 0, 'the pinned seeds never tagged the construct');
    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then every command refused for a case word inside a substitution carries the case-in-substitution tag', () => {
    const sut = pinnedCommands;

    const entries = sut().filter(entry => CASE_REFUSAL.test(gitInvocations(entry.text).reason ?? ''));
    const result = entries.filter(entry => !entry.tags.includes('case-in-substitution')).map(entry => entry.text);

    assert.ok(entries.length > 0, 'the pinned seeds never built the construct');
    assert.deepEqual(result, []);
  });

  it('Given the pinned seeds at scale, when generated, then every command tagged case-in-substitution is refused by the parser', () => {
    const sut = gitInvocations;

    const entries = pinnedCommands().filter(entry => entry.tags.includes('case-in-substitution'));
    const result = entries.filter(entry => sut(entry.text).parsed !== false).map(entry => entry.text);

    assert.ok(entries.length > 0, 'the pinned seeds never tagged the construct');
    assert.deepEqual(result, []);
  });

  it('Given each pinned seed at scale, when generated, then the command bash 3.2 rejects whole appears once and is never composed into another', () => {
    const sut = generateCommands;

    const result = PINNED_SEEDS.map(seed => sut(seed, PINNED_COUNT).filter(entry => WHOLE_COMMAND_REJECTED.test(entry.text)).length);

    assert.deepEqual(result, PINNED_SEEDS.map(() => 1));
  });
});

describe('shell-git-invocations — oracle on config section renames', () => {
  for (const argv of [['config', 'rename-section', 'x', 'include'], ['config', '--copy-section', 'x', 'IncludeIf']]) {
    it(`Given git ${argv.join(' ')}, when the oracle judges it, then it counts as a config injection`, () => {
      const sut = judgeArgv;

      const result = sut(argv);

      assert.deepEqual(result, { destructive: true, extDiff: true });
    });
  }
});

describe('shell-git-invocations — oracle on git show', () => {
  for (const [argv, extDiff] of [
    [['show'], false],
    [['show', '--stat', 'HEAD'], false],
    [['show', '--ext-diff'], true],
    [['show', '--no-ext-diff', '--ext-diff'], true],
    [['show', '--ext-diff', '--no-ext-diff'], false],
    [['diff'], true],
  ]) {
    it(`Given git ${argv.join(' ')}, when the oracle judges it, then extDiff is ${extDiff}`, () => {
      const sut = judgeArgv;

      const result = sut(argv);

      assert.deepEqual(result, { destructive: false, extDiff });
    });
  }
});
