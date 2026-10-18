import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORIGINAL_PATH,
  SANITY_BASH,
  SPAWN_TIMEOUT_MS,
  generateCommands,
  mapPool,
  oracleVerdict,
  runInShell,
  secondBash,
  withTree,
} from '../../../engine/test-helpers/git-differential-harness.js';
import { decideGuard } from '../src/git-guard-adapter.js';
import { preToolUseBash } from './fixtures/pre-tool-use-payload.js';

// Maintainers can scale the fuzz on demand: GUARD_FUZZ_SEEDS=1,2,3 (comma list) and GUARD_FUZZ_COUNT=2000 override these defaults.
const parseSeeds = text => text.split(',').map(Number);
const SEEDS = Object.freeze(process.env.GUARD_FUZZ_SEEDS ? parseSeeds(process.env.GUARD_FUZZ_SEEDS) : [20260]);
const CAP = Number(process.env.GUARD_FUZZ_COUNT ?? 400);
const FUZZ_TIMEOUT_MS = 120_000;
const DENY_EXIT_CODE = 2;
const ZSH = '/bin/zsh';
const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'craft-guard.js');
const REPO_ROOT = join(dirname(HOOK), '..', '..', '..');
const SECOND_BASH = secondBash();

const blocks = command => decideGuard(preToolUseBash(command)).block;
const countOf = items => items.filter(Boolean).length;

function runHook(command, craftRoot) {
  const env = { PATH: ORIGINAL_PATH, ...(craftRoot === undefined ? {} : { CRAFT_ROOT: craftRoot }) };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK], { env, stdio: ['pipe', 'pipe', 'ignore'], timeout: SPAWN_TIMEOUT_MS });
    const stdout = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout: Buffer.concat(stdout).toString() }));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(preToolUseBash(command)));
  });
}

function nodeProblems(command, run) {
  const expected = blocks(command);
  const problems = [];
  if (run.signal !== null) problems.push(`hook was killed (${run.signal})`);
  else if ((run.code === DENY_EXIT_CODE) !== expected) problems.push(`exit ${run.code} but in-process ${expected ? 'blocked' : 'allowed'}`);
  if (run.stdout !== '') problems.push('stdout is not empty');
  return problems;
}

function shellVerdict(command, run) {
  const oracle = oracleVerdict(run.argvs);
  const oracleBlocks = oracle.destructive || oracle.extDiff;
  const blocked = blocks(command);
  return { invoked: run.argvs.length > 0, falseAllow: oracleBlocks && !blocked, falseBlock: blocked && !oracleBlocks };
}

const report = (lines) => lines.join('\n');

describe('codex git guard - differential fuzz against shells and the real hook process', { concurrency: true }, () => {
  for (const seed of SEEDS) {
    const commands = generateCommands(seed, CAP);
    for (const [name, shell] of [['/bin/bash', SANITY_BASH], [ZSH, ZSH], ['the first bash >= 5 on PATH', SECOND_BASH]]) {
      it(
        `Given every command of seed ${seed}, when ${name} runs it against a stub git, then the guard never allows what the shell ran`,
        { timeout: FUZZ_TIMEOUT_MS, skip: shell === null ? 'no second bash >= 5 on PATH' : false },
        async t => {
          const sut = runInShell;

          const runs = await withTree(tree => mapPool(commands, (entry, index) => sut(shell, entry.text, tree, index)));

          const verdicts = commands.map((entry, index) => shellVerdict(entry.text, runs[index]));
          t.diagnostic(`generated ${commands.length}, invoked ${countOf(verdicts.map(v => v.invoked))}, false allows ${countOf(verdicts.map(v => v.falseAllow))}, false blocks ${countOf(verdicts.map(v => v.falseBlock))}`);
          const falseAllows = verdicts.flatMap((verdict, index) => (verdict.falseAllow ? [`FALSE ALLOW :: ${JSON.stringify(commands[index].text)} :: argv ${JSON.stringify(runs[index].argvs)}`] : []));
          assert.ok(falseAllows.length === 0, `\n${report(falseAllows)}`);
        }
      );
    }

    for (const [label, craftRoot] of [['set', REPO_ROOT], ['unset', undefined]]) {
      it(
        `Given every command of seed ${seed}, when the real hook runs with CRAFT_ROOT ${label}, then exit 2 matches the in-process block and stdout is empty`,
        { timeout: FUZZ_TIMEOUT_MS },
        async t => {
          const sut = runHook;
          const started = Date.now();

          const runs = await mapPool(commands, entry => sut(entry.text, craftRoot));

          t.diagnostic(`generated ${commands.length}, blocked ${countOf(commands.map(entry => blocks(entry.text)))}, wall ${Date.now() - started} ms`);
          const problems = commands.flatMap((entry, index) => nodeProblems(entry.text, runs[index]).map(problem => `${problem} :: ${JSON.stringify(entry.text)}`));
          assert.ok(problems.length === 0, `\n${report(problems)}`);
        }
      );
    }
  }
});
