import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'craft-guard.js');

/** Run the guard hook as a real subprocess, feed `payload` on stdin, return parsed stdout JSON. */
function runHook(stdin) {
  const out = execFileSync('node', [HOOK], { input: stdin, encoding: 'utf8' });
  return JSON.parse(out);
}

describe('craft-guard.js hook — the real subprocess emits the stdout-JSON deny wire', () => {
  it('Given a benign command payload, when the hook runs, then stdout is {"permission":"allow"}', () => {
    const sut = runHook(JSON.stringify({ hook_event_name: 'beforeShellExecution', command: 'echo hi', cwd: '/tmp/p', workspace_roots: ['/tmp/p'] }));

    assert.deepEqual(sut, { permission: 'allow' });
  });

  it('Given a git-ext-diff command payload, when the hook runs, then permission is "deny" with a non-empty user_message', () => {
    const sut = runHook(JSON.stringify({ hook_event_name: 'beforeShellExecution', command: 'git diff HEAD', cwd: '/tmp/p', workspace_roots: ['/tmp/p'] }));

    assert.equal(sut.permission, 'deny');
    assert.match(sut.user_message, /craft-guard:/);
    assert.ok(sut.user_message.length > 'craft-guard: '.length);
  });

  it('Given unparseable stdin, when the hook runs, then it fails CLOSED with permission "deny" and a non-empty message (never a blank craft-guard: line that reads as a crash)', () => {
    const sut = runHook('this is not json {{{');

    assert.equal(sut.permission, 'deny');
    assert.match(sut.user_message, /^craft-guard: \S/);
    assert.ok(sut.agent_message && sut.agent_message.length > 0);
  });

  it('Given a payload with no command, when the hook runs, then it fails CLOSED with permission "deny" and a non-empty message', () => {
    const sut = runHook(JSON.stringify({ hook_event_name: 'beforeShellExecution' }));

    assert.equal(sut.permission, 'deny');
    assert.match(sut.user_message, /^craft-guard: \S/);
  });

  it('Given a deny, when the hook writes, then it exits 0 (the wire is stdout JSON, not an exit code)', () => {
    // execFileSync throws on non-zero exit; a clean return proves exit 0 while denying.
    const out = execFileSync('node', [HOOK], {
      input: JSON.stringify({ hook_event_name: 'beforeShellExecution', command: 'git diff', cwd: '/tmp/p', workspace_roots: ['/tmp/p'] }),
      encoding: 'utf8',
    });

    assert.equal(JSON.parse(out).permission, 'deny');
  });
});
