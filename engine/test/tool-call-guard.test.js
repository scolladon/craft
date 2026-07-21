import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { toolCallGuard } from '../src/guards/tool-call-guard.js';

function repoRootFromHere() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

const WORKING_DIR = '/workspace/repo';

const bashEvent = (command) => ({
  tool: 'Bash',
  tool_input: { command },
  working_dir: WORKING_DIR,
});

const writeEvent = (path) => ({
  tool: 'Write',
  tool_input: { file_path: path },
  working_dir: WORKING_DIR,
});

describe('toolCallGuard() — git diff/show without --no-ext-diff', () => {
  it('Given a git diff tool call without --no-ext-diff, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;
    const event = bashEvent('git diff HEAD~1');

    const result = sut(event);

    assert.equal(result.block, true);
    assert.equal(typeof result.reason, 'string');
  });

  it('Given a git show tool call without --no-ext-diff, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;
    const event = bashEvent('git show HEAD');

    const result = sut(event);

    assert.equal(result.block, true);
  });

  it('Given a git diff tool call with --no-ext-diff, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = bashEvent('git diff --no-ext-diff HEAD~1');

    const result = sut(event);

    assert.equal(result.block, false);
  });

  it('Given a git show tool call with --no-ext-diff, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = bashEvent('git --no-ext-diff show HEAD');

    const result = sut(event);

    assert.equal(result.block, false);
  });

  it('Given an rtk proxy git diff call, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = bashEvent('rtk proxy git diff HEAD~1');

    const result = sut(event);

    assert.equal(result.block, false);
  });

  it('Given a non-git bash command, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = bashEvent('ls -la');

    const result = sut(event);

    assert.equal(result.block, false);
  });
});

describe('toolCallGuard() — write outside working dir', () => {
  it('Given a Write to a path outside the working dir, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;
    const event = writeEvent('/etc/passwd');

    const result = sut(event);

    assert.equal(result.block, true);
  });

  it('Given a Write to a path inside the working dir, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = writeEvent(`${WORKING_DIR}/src/file.js`);

    const result = sut(event);

    assert.equal(result.block, false);
  });

  it('Given a Write to the working dir itself, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = writeEvent(WORKING_DIR);

    const result = sut(event);

    assert.equal(result.block, false);
  });

  it('Given a Write attempting path traversal outside the working dir, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;
    const event = writeEvent(`${WORKING_DIR}/../secret`);

    const result = sut(event);

    assert.equal(result.block, true);
  });

  it('Given a Write to a sibling dir sharing the working-dir prefix, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;
    const event = writeEvent(`${WORKING_DIR}-evil/x.js`);

    const result = sut(event);

    assert.equal(result.block, true);
  });

  it('Given a Write to a relative path inside the working dir, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = writeEvent('src/file.js');

    const result = sut(event);

    assert.equal(result.block, false);
  });

  it('Given a Write to a relative path escaping the working dir, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;
    const event = writeEvent('../secret');

    const result = sut(event);

    assert.equal(result.block, true);
  });
});

describe('toolCallGuard() — Edit and NotebookEdit write-path guard', () => {
  it('Given an Edit event writing outside the working dir, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;
    const event = {
      tool: 'Edit',
      tool_input: { file_path: '/etc/hosts' },
      working_dir: WORKING_DIR,
    };

    const result = sut(event);

    assert.equal(result.block, true);
  });

  it('Given an Edit event writing inside the working dir, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = {
      tool: 'Edit',
      tool_input: { file_path: `${WORKING_DIR}/src/file.js` },
      working_dir: WORKING_DIR,
    };

    const result = sut(event);

    assert.equal(result.block, false);
  });

  it('Given a NotebookEdit event writing outside the working dir, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;
    const event = {
      tool: 'NotebookEdit',
      tool_input: { file_path: '/tmp/notebook.ipynb' },
      working_dir: WORKING_DIR,
    };

    const result = sut(event);

    assert.equal(result.block, true);
  });

  it('Given a NotebookEdit event writing inside the working dir, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = {
      tool: 'NotebookEdit',
      tool_input: { file_path: `${WORKING_DIR}/analysis.ipynb` },
      working_dir: WORKING_DIR,
    };

    const result = sut(event);

    assert.equal(result.block, false);
  });
});

describe('toolCallGuard() — reason string content on git block', () => {
  it('Given a bare git diff without --no-ext-diff, when guarded, then reason mentions --no-ext-diff', () => {
    const sut = toolCallGuard;
    const event = bashEvent('git diff HEAD~1');

    const result = sut(event);

    assert.ok(result.reason.includes('--no-ext-diff'), `reason must mention --no-ext-diff, got: ${result.reason}`);
  });

  it('Given a bare git show without --no-ext-diff, when guarded, then reason mentions external diff', () => {
    const sut = toolCallGuard;
    const event = bashEvent('git show HEAD');

    const result = sut(event);

    assert.ok(result.reason.includes('external diff'), `reason must mention external diff, got: ${result.reason}`);
  });
});

describe('toolCallGuard() — git diff/show regex pin: documented cases', () => {
  it('Given a bare git diff at command start without --no-ext-diff, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;

    const result = sut(bashEvent('git diff'));

    assert.equal(result.block, true);
  });

  it('Given a bare git show at command start without --no-ext-diff, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;

    const result = sut(bashEvent('git show'));

    assert.equal(result.block, true);
  });

  it('Given git diff with --no-ext-diff flag, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;

    const result = sut(bashEvent('git diff --no-ext-diff HEAD~1'));

    assert.equal(result.block, false);
  });

  it('Given git show with --no-ext-diff flag, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;

    const result = sut(bashEvent('git show --no-ext-diff HEAD'));

    assert.equal(result.block, false);
  });

  it('Given git difftool command, when guarded, then returns block: false (not a diff/show subcommand)', () => {
    const sut = toolCallGuard;

    const result = sut(bashEvent('git difftool'));

    assert.equal(result.block, false);
  });

  it('Given git show-ref command, when guarded, then returns block: false (not a plain show subcommand)', () => {
    const sut = toolCallGuard;

    const result = sut(bashEvent('git show-ref'));

    assert.equal(result.block, false);
  });

  it('Given git stash show command, when guarded, then returns block: false (stash subcommand)', () => {
    const sut = toolCallGuard;

    const result = sut(bashEvent('git stash show'));

    assert.equal(result.block, false);
  });

  it('Given git diff after semicolon without --no-ext-diff, when guarded, then returns block: true', () => {
    const sut = toolCallGuard;

    const result = sut(bashEvent('cd /repo; git diff HEAD'));

    assert.equal(result.block, true);
  });
});

describe('toolCallGuard() — missing tool_input fields default safely', () => {
  it('Given a Bash event with no command field, when guarded, then returns block: false (empty command is safe)', () => {
    const sut = toolCallGuard;
    const event = {
      tool: 'Bash',
      tool_input: {},
      working_dir: WORKING_DIR,
    };

    const result = sut(event);

    assert.equal(result.block, false);
  });

  it('Given a Write event with no file_path field, when guarded, then returns block: false (empty path resolves inside working dir)', () => {
    const sut = toolCallGuard;
    const event = {
      tool: 'Write',
      tool_input: {},
      working_dir: WORKING_DIR,
    };

    const result = sut(event);

    assert.equal(result.block, false);
  });
});

describe('toolCallGuard() — non-write tools with paths', () => {
  it('Given a non-Bash non-Write tool call, when guarded, then returns block: false', () => {
    const sut = toolCallGuard;
    const event = {
      tool: 'Read',
      tool_input: { file_path: '/etc/passwd' },
      working_dir: WORKING_DIR,
    };

    const result = sut(event);

    assert.equal(result.block, false);
  });
});

describe('tool-call-guard.js — lifted out of adapters/pi', () => {
  it('Given the repo tree, when the old adapter home is checked, then adapters/pi/src/gate.js no longer exists', () => {
    const repoRoot = repoRootFromHere();

    const sut = existsSync(join(repoRoot, 'adapters', 'pi', 'src', 'gate.js'));

    assert.equal(sut, false);
  });
});
