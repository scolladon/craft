import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { decideGuard } from '../src/git-guard-adapter.js';

const WORKING_DIR = '/repo';

function repoRootFromHere() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

function execPayload(cmd) {
  return { cwd: WORKING_DIR, tool_name: 'exec_command', tool_input: { cmd } };
}

function patchPayload(path) {
  return {
    cwd: WORKING_DIR,
    tool_name: 'apply_patch',
    tool_input: { input: ['*** Begin Patch', `*** Add File: ${path}`, '+x', '*** End Patch'].join('\n') },
  };
}

const BLOCK_COMMANDS = [
  'git diff',
  'git show',
  'git diff HEAD~1',
  'git show HEAD',
  'cd /repo; git diff HEAD',
  'git -C /x diff',
  'git -c k=v show',
  'git --git-dir=.g diff',
  'git --work-tree=. show',
];

// Unlike copilot's bash tool (which defaults a missing `command` to ''), an
// empty/absent `cmd` on exec_command throws in bridgeExecutedCommand and
// fails CLOSED — Codex never sends an empty `cmd`, so this list has no empty
// string, and that omission is deliberate, not an oversight.
const PASS_COMMANDS = [
  'git diff --no-ext-diff HEAD~1',
  'git --no-ext-diff show HEAD',
  'rtk proxy git diff',
  'git difftool',
  'git show-ref',
  'git stash show',
  'ls -la',
];

describe('decideGuard() — reused tool-call-guard.js predicate: git diff/show regex pin', () => {
  for (const command of BLOCK_COMMANDS) {
    it(`Given exec_command "${command}", when decideGuard runs, then it blocks`, () => {
      const sut = decideGuard;

      const result = sut(execPayload(command));

      assert.equal(result.block, true);
    });
  }

  for (const command of PASS_COMMANDS) {
    it(`Given exec_command "${command}", when decideGuard runs, then it passes`, () => {
      const sut = decideGuard;

      const result = sut(execPayload(command));

      assert.equal(result.block, false);
    });
  }
});

describe('decideGuard() — reused tool-call-guard.js predicate: write-path containment', () => {
  it('Given an apply_patch call whose path is inside the working dir, when decideGuard runs, then it passes', () => {
    const sut = decideGuard;

    const result = sut(patchPayload(`${WORKING_DIR}/src/file.js`));

    assert.equal(result.block, false);
  });

  it('Given an apply_patch call whose path is outside the working dir, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(patchPayload('/etc/passwd'));

    assert.equal(result.block, true);
  });
});

describe('tool-call-guard.js — single-sourced across bindings (codex)', () => {
  it('Given the repo tree, when checked, then engine/src/guards/tool-call-guard.js exists', () => {
    const repoRoot = repoRootFromHere();

    const sut = existsSync(join(repoRoot, 'engine', 'src', 'guards', 'tool-call-guard.js'));

    assert.equal(sut, true);
  });

  it('Given the codex adapter source text, when scanned, then it imports engine/src/guards/tool-call-guard.js', () => {
    const adapterPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'git-guard-adapter.js');

    const sut = readFileSync(adapterPath, 'utf8');

    assert.match(sut, /\.\.\/\.\.\/\.\.\/engine\/src\/guards\/tool-call-guard\.js/);
  });

  it('Given the repo tree, when checked, then adapters/codex/src/gate.js does not exist (no forked copy)', () => {
    const repoRoot = repoRootFromHere();

    const sut = existsSync(join(repoRoot, 'adapters', 'codex', 'src', 'gate.js'));

    assert.equal(sut, false);
  });
});
