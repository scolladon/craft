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

function bashPayload(command) {
  return { cwd: WORKING_DIR, toolName: 'bash', toolArgs: JSON.stringify({ command }) };
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

const PASS_COMMANDS = [
  'git diff --no-ext-diff HEAD~1',
  'git --no-ext-diff show HEAD',
  'rtk proxy git diff',
  'git difftool',
  'git show-ref',
  'git stash show',
  'ls -la',
  '',
];

describe('decideGuard() — reused gate.js predicate: git diff/show regex pin', () => {
  for (const command of BLOCK_COMMANDS) {
    it(`Given bash command "${command}", when decideGuard runs, then it blocks`, () => {
      const sut = decideGuard;

      const result = sut(bashPayload(command));

      assert.equal(result.block, true);
    });
  }

  for (const command of PASS_COMMANDS) {
    it(`Given bash command "${command}", when decideGuard runs, then it passes`, () => {
      const sut = decideGuard;

      const result = sut(bashPayload(command));

      assert.equal(result.block, false);
    });
  }
});

describe('decideGuard() — reused gate.js predicate: write-path containment', () => {
  it('Given a create call whose path is inside the working dir, when decideGuard runs, then it passes', () => {
    const sut = decideGuard;
    const event = {
      cwd: WORKING_DIR,
      toolName: 'create',
      toolArgs: JSON.stringify({ path: `${WORKING_DIR}/src/file.js`, file_text: 'x' }),
    };

    const result = sut(event);

    assert.equal(result.block, false);
  });

  it('Given a create call whose path is outside the working dir, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;
    const event = {
      cwd: WORKING_DIR,
      toolName: 'create',
      toolArgs: JSON.stringify({ path: '/etc/passwd', file_text: 'x' }),
    };

    const result = sut(event);

    assert.equal(result.block, true);
  });
});

describe('tool-call-guard.js — single-sourced across bindings', () => {
  it('Given the repo tree, when checked, then engine/src/guards/tool-call-guard.js exists', () => {
    const repoRoot = repoRootFromHere();

    const sut = existsSync(join(repoRoot, 'engine', 'src', 'guards', 'tool-call-guard.js'));

    assert.equal(sut, true);
  });

  it('Given the copilot adapter source text, when scanned, then it imports engine/src/guards/tool-call-guard.js', () => {
    const adapterPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'git-guard-adapter.js',
    );

    const sut = readFileSync(adapterPath, 'utf8');

    assert.match(sut, /\.\.\/\.\.\/\.\.\/engine\/src\/guards\/tool-call-guard\.js/);
  });

  it('Given the repo tree, when checked, then adapters/copilot/src/gate.js does not exist (no forked copy)', () => {
    const repoRoot = repoRootFromHere();

    const sut = existsSync(join(repoRoot, 'adapters', 'copilot', 'src', 'gate.js'));

    assert.equal(sut, false);
  });

  it('Given the repo tree, when checked, then adapters/pi/src/gate.js no longer exists (old home retired)', () => {
    const repoRoot = repoRootFromHere();

    const sut = existsSync(join(repoRoot, 'adapters', 'pi', 'src', 'gate.js'));

    assert.equal(sut, false);
  });
});
