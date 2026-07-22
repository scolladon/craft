import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adaptCursorEvent, decideGuard } from '../src/cursor-guard-adapter.js';

const WORKSPACE = '/tmp/proj';

function shellPayload(command, extra = {}) {
  return {
    hook_event_name: 'beforeShellExecution',
    command,
    cwd: WORKSPACE,
    workspace_roots: [WORKSPACE],
    ...extra,
  };
}

describe('adaptCursorEvent — reshapes the live beforeShellExecution payload', () => {
  it('Given a payload with a top-level command, when adapted, then the command maps into tool_input.command (not tool_input.command from a nested field)', () => {
    const sut = adaptCursorEvent(shellPayload('git status'));

    assert.deepEqual(sut, {
      tool: 'Bash',
      tool_input: { command: 'git status' },
      working_dir: WORKSPACE,
    });
  });

  it('Given a payload whose cwd is empty, when adapted, then working_dir falls back to workspace_roots[0]', () => {
    const sut = adaptCursorEvent(shellPayload('ls', { cwd: '' }));

    assert.equal(sut.working_dir, WORKSPACE);
  });

  it('Given a payload whose cwd differs from workspace_roots[0], when adapted, then cwd is preferred (not the workspace root)', () => {
    const sut = adaptCursorEvent({ command: 'ls', cwd: '/real-cwd', workspace_roots: ['/other-root'] });

    assert.equal(sut.working_dir, '/real-cwd');
  });

  it('Given a payload carrying a DECOY nested tool_input.command, when adapted, then the top-level command wins (the codex-trap field is ignored)', () => {
    const sut = adaptCursorEvent({ command: 'git status', tool_input: { command: 'rm -rf /' }, cwd: WORKSPACE, workspace_roots: [WORKSPACE] });

    assert.equal(sut.tool_input.command, 'git status');
  });

  it('Given a payload with neither cwd nor workspace_roots, when adapted, then working_dir is empty (shell path ignores it)', () => {
    const sut = adaptCursorEvent({ command: 'ls' });

    assert.equal(sut.working_dir, '');
  });

  it('Given a payload with no string command, when adapted, then it throws (malformed, not "nothing to check")', () => {
    assert.throws(() => adaptCursorEvent(shellPayload(undefined)));
  });
});

describe('decideGuard — allows benign, blocks the targeted git-ext-diff pattern, fails closed', () => {
  it('Given a benign echo, when decided, then it is allowed (not fail-closed-on-everything)', () => {
    const sut = decideGuard(shellPayload('echo HELLO'));

    assert.equal(sut.block, false);
  });

  it('Given git diff without --no-ext-diff, when decided, then it is blocked with the predicate reason', () => {
    const sut = decideGuard(shellPayload('git diff HEAD~1'));

    assert.equal(sut.block, true);
    assert.match(sut.reason, /--no-ext-diff/);
  });

  it('Given git diff --no-ext-diff, when decided, then it is allowed', () => {
    const sut = decideGuard(shellPayload('git diff --no-ext-diff HEAD~1'));

    assert.equal(sut.block, false);
  });

  it('Given a malformed payload (no command), when decided, then it fails CLOSED (block: true)', () => {
    const sut = decideGuard({ hook_event_name: 'beforeShellExecution' });

    assert.equal(sut.block, true);
  });

  it('Given a null payload, when decided, then it fails CLOSED (block: true)', () => {
    const sut = decideGuard(null);

    assert.equal(sut.block, true);
  });

  it('Given a guard that throws, when decided, then it fails CLOSED (block: true)', () => {
    const throwingGuard = () => {
      throw new Error('predicate exploded');
    };

    const sut = decideGuard(shellPayload('echo hi'), throwingGuard);

    assert.equal(sut.block, true);
  });

  it('Given decideGuard, when it blocks, then the reason comes from the SHARED predicate (not re-implemented here)', () => {
    // The reason string is defined only in engine/src/guards/git-ext-diff-predicate.js;
    // its presence proves the shared predicate ran, not a local copy.
    const sut = decideGuard(shellPayload('git show'));

    assert.match(sut.reason, /external diff mangles parsed output/);
  });
});
