import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHORS,
  CORE_SHAPES,
  PLAIN_GATE_FALSE_BLOCK_TAGS,
  PLAIN_GATE_TAGS,
  SHELL_DEPENDENT_TAGS,
  STUBS,
  generatePlainGateCommands,
  installStubs,
} from '../../../engine/test-helpers/plain-gate-generator.js';
import {
  SANITY_BASH,
  mapPool,
  oracleVerdict,
  runInShell,
  secondBash,
  withTree,
} from '../../../engine/test-helpers/git-differential-harness.js';
import { decideGuard } from '../src/git-guard-adapter.js';

// Maintainers can scale the fuzz on demand: GUARD_FUZZ_SEEDS=1,2,3 (comma list) and GUARD_FUZZ_COUNT=2000 override these defaults.
const parseSeeds = text => text.split(',').map(Number);
const SEEDS = Object.freeze(process.env.GUARD_FUZZ_SEEDS ? parseSeeds(process.env.GUARD_FUZZ_SEEDS) : [20260]);
const CAP = Number(process.env.GUARD_FUZZ_COUNT ?? 400);
const FUZZ_TIMEOUT_MS = 120_000;
// Measured on the default seed: 356 under /bin/bash 3.2, 390 under bash 5.2.
const INVOKED_FLOOR = 300;
const SECOND_BASH = secondBash();
const SYNTAX_ERROR = /syntax error|unexpected EOF/;
const ACCEPTED_BLOCK_TAGS = Object.freeze([...PLAIN_GATE_FALSE_BLOCK_TAGS, PLAIN_GATE_TAGS.residual]);
// The gate reads a -c or --config-env word as a git config key, so such a word would block for a reason other than the rule under test.
const ATTACHED_CONFIG_WORD = /^(?:--config-env|-c.)/is;
const readsAsConfigFlag = word => word === '-c' || ATTACHED_CONFIG_WORD.test(word);
const COINCIDENCE_FREE_CLASSES = Object.freeze([PLAIN_GATE_TAGS.evaluatorWord, PLAIN_GATE_TAGS.argvWrapper, PLAIN_GATE_TAGS.residual]);
const STUBBED_NAMES = Object.freeze([
  'arch', 'caffeinate', 'chrt', 'doas', 'flock', 'nice', 'nohup', 'parallel', 'setsid', 'ssh', 'stdbuf', 'strace', 'sudo', 'taskset',
  'timeout', 'tmux', 'unbuffer', 'watch', 'xcrun',
]);

const countBy = items => items.reduce((counts, item) => ({ ...counts, [item]: (counts[item] ?? 0) + 1 }), {});
const wordsOf = text => text.split(/\s+/).map(word => word.replace(/^'|'$/g, ''));

const bashPayload = command => ({ sessionId: 's1', timestamp: 0, cwd: '/repo', toolName: 'bash', toolArgs: JSON.stringify({ command }) });
const blocks = command => decideGuard(bashPayload(command)).block;
const hasAny = (entry, tags) => tags.some(tag => entry.tags.includes(tag));

function verdictsOf(entry, run) {
  const oracle = oracleVerdict(run.argvs);
  return { oracleBlocks: oracle.destructive || oracle.extDiff, blocked: blocks(entry.text) };
}

function problemsOf(entry, run, { oracleBlocks, blocked }) {
  const problems = [];
  if (run.signal !== null) problems.push(`shell was killed (${run.signal})`);
  if (SYNTAX_ERROR.test(run.stderr) && !hasAny(entry, SHELL_DEPENDENT_TAGS)) problems.push(`generator emitted invalid shell: ${run.stderr.trim().replaceAll('\n', ' / ')}`);
  if (oracleBlocks && !blocked) problems.push(`FALSE ALLOW: the shell ran ${JSON.stringify(run.argvs)} and copilotGuard allowed it`);
  if (blocked && !oracleBlocks && !hasAny(entry, ACCEPTED_BLOCK_TAGS)) problems.push('unexpected false block (no intended-false-block class)');
  return problems;
}

function judgeRun(entry, run) {
  const verdicts = verdictsOf(entry, run);
  const falseBlock = verdicts.blocked && !verdicts.oracleBlocks;
  return {
    problems: problemsOf(entry, run, verdicts),
    invoked: run.argvs.length > 0,
    falseBlockTags: falseBlock ? entry.tags.filter(tag => ACCEPTED_BLOCK_TAGS.includes(tag)) : [],
  };
}

function fuzzShell(shell, commands) {
  return withTree(async tree => {
    installStubs(tree.bin);
    const runs = await mapPool(commands, (entry, index) => runInShell(shell, entry.text, tree, index));
    return commands.map((entry, index) => judgeRun(entry, runs[index]));
  });
}

const failureReport = (commands, verdicts) =>
  verdicts.flatMap((verdict, index) => verdict.problems.map(problem => `${problem} :: ${JSON.stringify(commands[index].text)}`)).join('\n');

describe('plain gate generator - deterministic, coincidence-free, every class reached', () => {
  it('Given the fixed seeds, when the commands are generated twice, then both lists are identical and hold the cap', () => {
    const sut = generatePlainGateCommands;

    for (const seed of SEEDS) {
      const result = sut(seed, CAP);

      assert.deepEqual(result, sut(seed, CAP));
      assert.equal(result.length, CAP);
    }
  });

  it('Given the default seed, when the tags are counted, then every class tag is reached', () => {
    const sut = generatePlainGateCommands(SEEDS[0], CAP);

    const result = countBy(sut.flatMap(entry => entry.tags));

    for (const tag of Object.values(PLAIN_GATE_TAGS)) assert.ok((result[tag] ?? 0) > 0, `generator never reached ${tag}`);
  });

  it('Given every core shape, when generated with no prefix and no filler, then the anchor list holds it exactly once', () => {
    const sut = generatePlainGateCommands(SEEDS[0], CAP).slice(0, ANCHORS.length).map(entry => entry.text);

    for (const core of CORE_SHAPES) {
      const result = sut.filter(text => text === `${core.head}${core.render('git push')}`);

      assert.equal(result.length, 1, `${core.head}${core.render('git push')}`);
    }
  });

  it('Given the evaluator, wrapper and runner shapes, when their words are scanned, then none reads as a git config flag', () => {
    const sut = CORE_SHAPES.filter(core => core.tags.some(tag => COINCIDENCE_FREE_CLASSES.includes(tag)));

    const result = sut.flatMap(core => wordsOf(`${core.head}${core.render('git push')}`)).filter(readsAsConfigFlag);

    assert.deepEqual(result, []);
  });

  it('Given the stubs, when listed, then every external wrapper and runner the generator names is stubbed', () => {
    const sut = STUBS;

    const result = Object.keys(sut).sort();

    assert.deepEqual(result, STUBBED_NAMES);
  });

  for (const { label, argv } of [
    { label: 'an argv wrapper', argv: ['chrt', '-o', '0', 'printf', '%s', 'ran'] },
    { label: 'a string runner', argv: ['watch', '-n1', '-t', 'printf %s ran'] },
    { label: 'the ssh stub', argv: ['ssh', 'host', 'printf', '%s', 'ran'] },
  ]) {
    it(`Given ${label} stub installed in a temp bin, when run with a probe argv, then it runs the wrapped command`, () => {
      const bin = mkdtempSync(join(tmpdir(), 'craft-plain-gate-stubs-'));
      try {
        installStubs(bin);
        const sut = join(bin, argv[0]);

        const result = execFileSync(sut, argv.slice(1), { encoding: 'utf8' });

        assert.equal(result, 'ran');
      } finally {
        rmSync(bin, { recursive: true, force: true });
      }
    });
  }
});

describe('copilot git guard - differential fuzz of the plain-command gate against real bash', { concurrency: true }, () => {
  for (const seed of SEEDS) {
    const commands = generatePlainGateCommands(seed, CAP);
    for (const [name, shell] of [['/bin/bash', SANITY_BASH], ['the first bash >= 5 on PATH', SECOND_BASH]]) {
      it(
        `Given every command of seed ${seed}, when ${name} runs it against a stub git, then copilotGuard never allows what the shell ran`,
        { timeout: FUZZ_TIMEOUT_MS, skip: shell === null ? 'no second bash >= 5 on PATH' : false },
        async t => {
          const sut = fuzzShell;
          const started = Date.now();

          const result = await sut(shell, commands);

          const invoked = result.filter(verdict => verdict.invoked).length;
          t.diagnostic(`generated ${commands.length}, invoked ${invoked}, false blocks ${JSON.stringify(countBy(result.flatMap(verdict => verdict.falseBlockTags)))}, wall ${Date.now() - started} ms`);
          const report = failureReport(commands, result);
          assert.ok(report === '', `\n${report}`);
          assert.ok(invoked >= INVOKED_FLOOR, `only ${invoked} commands logged a git argv`);
        }
      );
    }
  }
});
