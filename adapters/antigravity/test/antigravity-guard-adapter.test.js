import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adaptAntigravityEvent, decideGuard } from '../src/antigravity-guard-adapter.js';

const WORKING_DIR = '/repo';

// The REAL Antigravity run_command hook payload shape, pinned from the shipped
// language_server (toolCall.args.CommandLine / .Cwd) — never assumed.
function runCommandPayload(commandLine, cwd = WORKING_DIR) {
  return { toolCall: { name: 'run_command', args: { CommandLine: commandLine, Cwd: cwd, Blocking: true } } };
}

describe('adaptAntigravityEvent — reshapes the pinned payload to the guard event', () => {
  it('Given a run_command payload, when adapted, then CommandLine maps to a Bash command and Cwd to working_dir', () => {
    const sut = adaptAntigravityEvent(runCommandPayload('git diff'));

    assert.deepEqual(sut, { tool: 'Bash', tool_input: { command: 'git diff' }, working_dir: WORKING_DIR });
  });

  it('Given a non-run_command tool, when adapted, then it is a benign pass-through (empty tool_input)', () => {
    const sut = adaptAntigravityEvent({ toolCall: { name: 'view_file', args: { AbsolutePath: '/repo/a.js' } } });

    assert.deepEqual(sut, { tool: 'view_file', tool_input: {}, working_dir: '' });
  });

  it('Given a payload with no toolCall object, when adapted, then it throws', () => {
    assert.throws(() => adaptAntigravityEvent({}), /no toolCall object/);
  });

  it('Given a run_command payload whose CommandLine is missing, when adapted, then it throws', () => {
    assert.throws(() => adaptAntigravityEvent({ toolCall: { name: 'run_command', args: { Cwd: WORKING_DIR } } }), /no CommandLine/);
  });

  it('Given a run_command payload with no Cwd, when adapted, then working_dir falls back to the empty string', () => {
    const sut = adaptAntigravityEvent({ toolCall: { name: 'run_command', args: { CommandLine: 'git diff' } } });

    assert.deepEqual(sut, { tool: 'Bash', tool_input: { command: 'git diff' }, working_dir: '' });
  });
});

describe('decideGuard — enforces git-ext-diff via the shared predicate, both directions', () => {
  it('Given run_command git diff without --no-ext-diff, when decided, then it blocks with the ext-diff reason', () => {
    const sut = decideGuard(runCommandPayload('git diff'));

    assert.equal(sut.block, true);
    assert.match(sut.reason, /--no-ext-diff/);
  });

  it('Given run_command git show without --no-ext-diff, when decided, then it blocks', () => {
    const sut = decideGuard(runCommandPayload('git show HEAD'));

    assert.equal(sut.block, true);
  });

  it('Given run_command git diff --no-ext-diff, when decided, then it allows', () => {
    const sut = decideGuard(runCommandPayload('git diff --no-ext-diff'));

    assert.equal(sut.block, false);
  });

  it('Given run_command echo (a benign command), when decided, then it allows — NOT fail-closed-on-everything', () => {
    const sut = decideGuard(runCommandPayload('echo hello'));

    assert.equal(sut.block, false);
  });

  it('Given run_command npm test (a benign command), when decided, then it allows', () => {
    const sut = decideGuard(runCommandPayload('npm test'));

    assert.equal(sut.block, false);
  });

  it('Given a structurally hostile payload, when decided, then it fails CLOSED with a non-empty reason', () => {
    const sut = decideGuard({ not: 'a toolCall' });

    assert.equal(sut.block, true);
    assert.ok(sut.reason && sut.reason.length > 0);
    assert.match(sut.reason, /fail-closed/);
  });

  it('Given a run_command payload missing CommandLine, when decided, then it fails CLOSED', () => {
    const sut = decideGuard({ toolCall: { name: 'run_command', args: {} } });

    assert.equal(sut.block, true);
  });

  it('Given a non-run_command tool, when decided, then it passes through (no opinion)', () => {
    const sut = decideGuard({ toolCall: { name: 'edit_file', args: { TargetFile: '/repo/a.js' } } });

    assert.equal(sut.block, false);
  });
});
