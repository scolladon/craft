'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ORIGINAL_PATH, SPAWN_TIMEOUT_MS, generateCommands, mapPool } = require('../engine/test-helpers/git-differential-harness.js');
const { gitExtDiffPredicate } = require('../engine/src/guards/git-ext-diff-predicate.js');

// Maintainers can scale the fuzz on demand: GUARD_FUZZ_SEEDS=1,2,3 (comma list) and GUARD_FUZZ_COUNT=2000 override these defaults.
const parseSeeds = (text) => text.split(',').map(Number);
const SEEDS = Object.freeze(process.env.GUARD_FUZZ_SEEDS ? parseSeeds(process.env.GUARD_FUZZ_SEEDS) : [20260]);
const CAP = Number(process.env.GUARD_FUZZ_COUNT ?? 400);
const FUZZ_TIMEOUT_MS = 120_000;
const VERDICT_EXIT_CODE = 0;
const REASON_PREFIX = 'craft: ';
const MAX_REPORTED_CHARS = 200;
const PIPE_BUFFER_OVERFLOW_LINES = 14000;
const HOOK = path.join(__dirname, '..', 'hooks', 'git-no-ext-diff.sh');
// Strings whose JSON round trip differs from a plain one: escapes the payload encoder must emit and node must decode.
const DECODE_EDGE_COMMANDS = Object.freeze([
  'git diff \u2028',
  'echo a \u2029; git diff',
  'git diff \u0000x',
  'git diff \ud800',
  'echo "\udfff"; git show',
  `git diff HEAD\n${'echo pad\n'.repeat(PIPE_BUFFER_OVERFLOW_LINES)}`,
  'echo été; git diff --no-ext-diff',
]);

function runHook(command) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [HOOK], { env: { PATH: ORIGINAL_PATH }, stdio: ['pipe', 'pipe', 'pipe'], timeout: SPAWN_TIMEOUT_MS });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ tool_input: { command } }));
  });
}

function expectedStdout(command) {
  const verdict = gitExtDiffPredicate(command);
  if (!verdict.block) return '';
  const reason = verdict.reason.startsWith(REASON_PREFIX) ? verdict.reason : `${REASON_PREFIX}${verdict.reason}`;
  return `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })}\n`;
}

function problemsOf(command, run) {
  if (run.signal !== null) return [`hook was killed (${run.signal})`];
  const problems = [];
  if (run.code !== VERDICT_EXIT_CODE) problems.push(`exit ${run.code}: ${run.stderr.trim()}`);
  if (run.stdout !== expectedStdout(command)) problems.push(`stdout ${JSON.stringify(run.stdout.slice(0, MAX_REPORTED_CHARS))} differs from the in-process verdict`);
  return problems;
}

const describeCommand = (command) => JSON.stringify(command.length > MAX_REPORTED_CHARS ? `${command.slice(0, MAX_REPORTED_CHARS)}...` : command);

describe('claude ext-diff hook - differential against the in-process engine verdict', { concurrency: true }, () => {
  for (const seed of SEEDS) {
    it(`Given every command of seed ${seed} plus the decode edge commands, when the real hook judges each, then it exits 0 with exactly the in-process verdict`, { timeout: FUZZ_TIMEOUT_MS }, async (t) => {
      const commands = [...generateCommands(seed, CAP).map((entry) => entry.text), ...DECODE_EDGE_COMMANDS];
      const sut = runHook;
      const started = Date.now();

      const runs = await mapPool(commands, (command) => sut(command));

      t.diagnostic(`judged ${commands.length}, blocked ${commands.filter((command) => gitExtDiffPredicate(command).block).length}, wall ${Date.now() - started} ms`);
      const problems = commands.flatMap((command, index) => problemsOf(command, runs[index]).map((problem) => `${problem} :: ${describeCommand(command)}`));
      assert.ok(problems.length === 0, `\n${problems.join('\n')}`);
    });
  }
});
