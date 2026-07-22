import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'craft-guard.js');
const WORKING_DIR = '/repo';

// Spawns OUR hook script under `node`, never the real Antigravity binary — the
// only permitted way to exercise the stdout-decision contract as a subprocess.
function run(payload) {
  return spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });
}

function runCommandPayload(commandLine) {
  return JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: commandLine, Cwd: WORKING_DIR, Blocking: true } } });
}

describe('craft-guard hook — Antigravity stdout-decision contract', () => {
  it('Given run_command git diff, when the hook runs, then stdout is a deny decision and exit is 0', () => {
    const sut = run(runCommandPayload('git diff'));

    assert.equal(sut.status, 0);
    assert.deepEqual(JSON.parse(sut.stdout).decision, 'deny');
  });

  it('Given a blocking payload, when the hook runs, then the deny reason names --no-ext-diff', () => {
    const sut = run(runCommandPayload('git diff'));

    assert.match(JSON.parse(sut.stdout).reason, /--no-ext-diff/);
  });

  it('Given run_command git diff --no-ext-diff, when the hook runs, then stdout is empty (allow) and exit is 0', () => {
    const sut = run(runCommandPayload('git diff --no-ext-diff'));

    assert.equal(sut.status, 0);
    assert.equal(sut.stdout, '');
  });

  it('Given run_command echo (benign), when the hook runs, then stdout is empty — NOT a blanket deny', () => {
    const sut = run(runCommandPayload('echo hello'));

    assert.equal(sut.status, 0);
    assert.equal(sut.stdout, '');
  });

  it('Given a payload that is not valid JSON, when the hook runs, then stdout is a deny decision (fail closed)', () => {
    const sut = run('{not json');

    assert.equal(JSON.parse(sut.stdout).decision, 'deny');
  });

  it('Given empty stdin, when the hook runs, then stdout is a deny decision (fail closed)', () => {
    const sut = run('');

    assert.equal(JSON.parse(sut.stdout).decision, 'deny');
  });

  it('Given a run_command payload missing CommandLine, when the hook runs, then it denies with a non-empty reason', () => {
    const sut = run(JSON.stringify({ toolCall: { name: 'run_command', args: {} } }));

    const decision = JSON.parse(sut.stdout);
    assert.equal(decision.decision, 'deny');
    assert.notEqual(decision.reason.trim(), '');
  });

  it('Given a blocking verdict, when the hook runs, then stderr also carries a greppable craft-guard line', () => {
    const sut = run(runCommandPayload('git diff'));

    assert.match(sut.stderr, /craft-guard/);
  });

  it('Given a deny, when the hook runs, then the full decision JSON survives on stdout (flushed before exit, not truncated)', () => {
    const sut = run(runCommandPayload('git diff'));

    // Fail-open regression: on Antigravity the stdout bytes ARE the enforcement, so a
    // truncated write would silently allow. Parsing the whole payload pins completeness.
    const decision = JSON.parse(sut.stdout);
    assert.equal(decision.decision, 'deny');
    assert.ok(decision.reason.length > 0);
  });
});
