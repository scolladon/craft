import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { toolCallHook } from '../src/tool-call-hook.js';

const WORKING_DIR = '/workspace/repo';

const piToolCallEvent = ({ name, tool, toolName, input, args }) => ({
  name: name ?? tool,
  tool,
  toolName,
  arguments: args,
  input,
});

const ctx = { workingDir: WORKING_DIR };

describe('toolCallHook() — delegates to the pure predicate', () => {
  it('Given a Pi tool_call event for a bare git diff, when the hook runs, then it returns block:true with a reason (delegates to the pure predicate)', async () => {
    const sut = toolCallHook();
    const event = piToolCallEvent({
      name: 'Bash',
      args: { command: 'git diff HEAD~1' },
    });

    const result = await sut(event, ctx);

    assert.equal(result.block, true);
    assert.equal(typeof result.reason, 'string');
  });

  it('Given a Pi event the predicate clears, when the hook runs, then it returns block:false (passthrough through the write re-check)', async () => {
    const sut = toolCallHook();
    const event = piToolCallEvent({
      name: 'Read',
      args: { file_path: '/etc/passwd' },
    });

    const result = await sut(event, ctx);

    assert.equal(result.block, false);
  });
});

describe('toolCallHook() — fail-safe', () => {
  it('Given a guard that throws, when the hook runs, then it returns block:true (fail-safe)', async () => {
    const sut = toolCallHook(() => {
      throw new Error('boom');
    });
    const event = piToolCallEvent({ name: 'Bash', args: { command: 'ls' } });

    const result = await sut(event, ctx);

    assert.equal(result.block, true);
  });
});

describe('toolCallHook() — pinned veto shape', () => {
  it('Given a blocked event, when the hook runs, then the result has no permission field (pinned veto shape)', async () => {
    const sut = toolCallHook();
    const event = piToolCallEvent({
      name: 'Bash',
      args: { command: 'git diff HEAD~1' },
    });

    const result = await sut(event, ctx);

    assert.equal(Object.hasOwn(result, 'permission'), false);
  });
});

describe('toolCallHook() — Pi event adapter mapping', () => {
  it('Given a Pi event using name/arguments field names, when adapted, then the guard receives tool and tool_input.command', async () => {
    let captured;
    const recordingGuard = (guardEvent) => {
      captured = guardEvent;
      return { block: false };
    };
    const sut = toolCallHook(recordingGuard);
    const event = piToolCallEvent({
      name: 'Bash',
      args: { command: 'ls -la' },
    });

    await sut(event, ctx);

    assert.equal(captured.tool, 'Bash');
    assert.deepEqual(captured.tool_input, { command: 'ls -la' });
    assert.equal(captured.working_dir, WORKING_DIR);
  });
});

describe('toolCallHook() — runtime symlink re-check', () => {
  const tmps = [];

  after(async () => {
    await Promise.all(tmps.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('Given a Write through a symlink whose realpath escapes the working dir, when the hook runs, then it returns block:true (the case the lexical guard misses)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'craft-pi-symlink-test-'));
    tmps.push(tmp);
    await symlink('/etc', join(tmp, 'link'));
    const sut = toolCallHook();
    const event = piToolCallEvent({ name: 'Write', args: { file_path: 'link/x' } });
    const localCtx = { workingDir: tmp };

    const result = await sut(event, localCtx);

    assert.equal(result.block, true);
  });

  it('Given a Write to a final-component symlink whose target escapes the working dir, when the hook runs, then it returns block:true (final-component symlink, not just the parent dir)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'craft-pi-finalsymlink-test-'));
    tmps.push(tmp);
    await symlink('/etc/passwd', join(tmp, 'filelink'));
    const sut = toolCallHook();
    const event = piToolCallEvent({ name: 'Write', args: { file_path: 'filelink' } });
    const localCtx = { workingDir: tmp };

    const result = await sut(event, localCtx);

    assert.equal(result.block, true);
  });

  it('Given a Write into a not-yet-existing subdir inside the working dir, when the hook runs, then it returns block:false (DC-5 nearest-existing-ancestor is contained)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'craft-pi-newdir-test-'));
    tmps.push(tmp);
    const sut = toolCallHook();
    const event = piToolCallEvent({ name: 'Write', args: { file_path: 'sub/new/x' } });
    const localCtx = { workingDir: tmp };

    const result = await sut(event, localCtx);

    assert.equal(result.block, false);
  });

  it('Given a non-write tool with an outside file_path, when the hook runs, then it returns block:false (re-check is write-only)', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'craft-pi-readonly-test-'));
    tmps.push(tmp);
    const sut = toolCallHook();
    const event = piToolCallEvent({ name: 'Read', args: { file_path: '/etc/passwd' } });
    const localCtx = { workingDir: tmp };

    const result = await sut(event, localCtx);

    assert.equal(result.block, false);
  });

  it('Given a Write whose file_path targets a sibling dir sharing the working-dir prefix, when the hook runs, then it returns block:true (prefix-sharing sibling must not pass startsWith check)', async () => {
    // This kills the `startsWith` → `endsWith` mutant and the `+ sep` → `- sep` mutant:
    // a sibling like /tmp/craft-pi-XYZ-evil would share the prefix /tmp/craft-pi-XYZ
    // unless the sep is appended — without sep, /tmp/craft-pi-XYZ-evil starts with /tmp/craft-pi-XYZ.
    const tmp = await mkdtemp(join(tmpdir(), 'craft-pi-sibling-test-'));
    tmps.push(tmp);
    const sut = toolCallHook();
    // Target the working dir itself through a symlink pointing one level up to a sibling
    // We use /etc as the "outside" canonical target via a symlink inside the working dir.
    await symlink('/etc', join(tmp, 'evil'));
    const event = piToolCallEvent({ name: 'Write', args: { file_path: 'evil/hosts' } });
    const localCtx = { workingDir: tmp };

    const result = await sut(event, localCtx);

    assert.equal(result.block, true);
  });

  it('Given a Write to an exact working-dir path (no sub-path), when the hook runs, then it returns block:false (exact match allowed)', async () => {
    // Kills the equality branch of isContained: `realParent === realWorking`.
    // A write to the working dir itself (file at root level) — ancestor is the dir = working dir.
    const tmp = await mkdtemp(join(tmpdir(), 'craft-pi-exact-test-'));
    tmps.push(tmp);
    const sut = toolCallHook();
    const event = piToolCallEvent({ name: 'Write', args: { file_path: 'newfile.txt' } });
    const localCtx = { workingDir: tmp };

    const result = await sut(event, localCtx);

    assert.equal(result.block, false);
  });

  it('Given a Write to an existing subdirectory inside the working dir, when the hook runs, then it returns block:false (startsWith — not endsWith — gates containment)', async () => {
    // Kills the `startsWith` → `endsWith` mutant AND the `+ sep` → `- sep` mutant:
    // realParent = /real/tmp/work/sub, realWorking = /real/tmp/work
    // startsWith('/real/tmp/work/') → true (allowed) ✓
    // endsWith('/real/tmp/work/') → false (would incorrectly block) — mutant exposed
    // startsWith(NaN via subtraction) → false (would incorrectly block) — mutant exposed
    const { mkdir } = await import('node:fs/promises');
    const tmp = await mkdtemp(join(tmpdir(), 'craft-pi-subdir-test-'));
    tmps.push(tmp);
    await mkdir(join(tmp, 'sub'));
    const sut = toolCallHook();
    const event = piToolCallEvent({ name: 'Write', args: { file_path: 'sub/newfile.txt' } });
    const localCtx = { workingDir: tmp };

    const result = await sut(event, localCtx);

    assert.equal(result.block, false);
  });
});

describe('toolCallHook() — pi 0.80.10 toolName/path event shape', () => {
  it('Given a pi 0.80.10 bash tool_call for a bare git diff, when the hook runs, then it returns block:true with a reason', async () => {
    const sut = toolCallHook();
    const event = piToolCallEvent({ toolName: 'bash', input: { command: 'git diff HEAD~1' } });

    const result = await sut(event, ctx);

    assert.equal(result.block, true);
    assert.equal(typeof result.reason, 'string');
  });

  it('Given a pi 0.80.10 bash tool_call carrying --no-ext-diff, when the hook runs, then it returns block:false (compliant escape)', async () => {
    const sut = toolCallHook();
    const event = piToolCallEvent({
      toolName: 'bash',
      input: { command: 'git diff --no-ext-diff HEAD~1' },
    });

    const result = await sut(event, ctx);

    assert.equal(result.block, false);
  });

  it('Given a pi 0.80.10 write tool_call using toolName/path, when adapted, then the guard receives tool:"Write" and tool_input.file_path from path', async () => {
    let captured;
    const recordingGuard = (guardEvent) => {
      captured = guardEvent;
      return { block: false };
    };
    const sut = toolCallHook(recordingGuard);
    const event = piToolCallEvent({ toolName: 'write', input: { path: 'sub/x', content: 'y' } });

    await sut(event, ctx);

    assert.equal(captured.tool, 'Write');
    assert.equal(captured.tool_input.file_path, 'sub/x');
  });

  it('Given a pi 0.80.10 edit tool_call using toolName/path, when adapted, then the guard receives tool:"Edit" and tool_input.file_path from path', async () => {
    let captured;
    const recordingGuard = (guardEvent) => {
      captured = guardEvent;
      return { block: false };
    };
    const sut = toolCallHook(recordingGuard);
    const event = piToolCallEvent({ toolName: 'edit', input: { path: 'sub/y' } });

    await sut(event, ctx);

    assert.equal(captured.tool, 'Edit');
    assert.equal(captured.tool_input.file_path, 'sub/y');
  });

  it('Given a pi 0.80.10 write carrying both an out-of-tree path and an in-tree file_path decoy, when adapted, then the guard receives the authoritative path (pi writes to path, not the decoy)', async () => {
    let captured;
    const recordingGuard = (guardEvent) => {
      captured = guardEvent;
      return { block: false };
    };
    const sut = toolCallHook(recordingGuard);
    const event = piToolCallEvent({ toolName: 'write', input: { path: '../outside', file_path: 'inside.txt', content: 'y' } });

    await sut(event, ctx);

    assert.equal(captured.tool_input.file_path, '../outside');
  });

  it('Given a pi 0.80.10 write to an outside path with an in-tree file_path decoy, when the hook runs, then it returns block:true (the decoy cannot mask the escape)', async () => {
    const sut = toolCallHook();
    const event = piToolCallEvent({ toolName: 'write', input: { path: '/etc/passwd', file_path: 'inside.txt', content: 'y' } });

    const result = await sut(event, ctx);

    assert.equal(result.block, true);
  });

  it('Given a blocked pi 0.80.10 toolName-shaped event, when the hook runs, then the result has no permission field (pinned veto shape)', async () => {
    const sut = toolCallHook();
    const event = piToolCallEvent({ toolName: 'bash', input: { command: 'git diff HEAD~1' } });

    const result = await sut(event, ctx);

    assert.equal(Object.hasOwn(result, 'permission'), false);
  });
});

describe('toolCallHook() — resolveExistingAncestorRealpath ENOENT recursion', () => {
  const tmps = [];

  after(async () => {
    await Promise.all(tmps.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('Given a Write to a deeply nested not-yet-existing path, when the hook runs, then it returns block:false (ENOENT recurses up to nearest existing ancestor)', async () => {
    // Kills the `if (false) throw err` mutant on line 33: if ENOENT is not re-thrown,
    // recursion terminates correctly at the existing ancestor.
    const tmp = await mkdtemp(join(tmpdir(), 'craft-pi-deep-test-'));
    tmps.push(tmp);
    const sut = toolCallHook();
    const event = piToolCallEvent({ name: 'Write', args: { file_path: 'a/b/c/d/new.txt' } });
    const localCtx = { workingDir: tmp };

    const result = await sut(event, localCtx);

    assert.equal(result.block, false);
  });
});
