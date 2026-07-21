import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideGuard } from '../src/git-guard-adapter.js';

const WORKING_DIR = '/repo';

function execPayload(cmd, overrides = {}) {
  return { cwd: WORKING_DIR, tool_name: 'exec_command', tool_input: { cmd, ...overrides } };
}

function patchPayload(text) {
  return { cwd: WORKING_DIR, tool_name: 'apply_patch', tool_input: { input: text } };
}

function patch(...lines) {
  return ['*** Begin Patch', ...lines, '*** End Patch'].join('\n');
}

const IN_TREE_ADD = patch('*** Add File: src/a.js', '+export const a = 1;');
const DECOY_MULTI_HUNK = patch(
  '*** Update File: src/a.js',
  '@@',
  '-old',
  '+new',
  '*** Add File: ../../../etc/evil',
  '+malicious',
);
const RENAME_ESCAPE = patch(
  '*** Update File: src/a.js',
  '*** Move to: ../../outside.js',
  '@@',
  '-old',
  '+new',
);
const DELETE_ABSOLUTE = patch('*** Delete File: /etc/passwd');
const NO_PATH_AT_ALL = patch();
const EMPTY_PATH = patch('*** Add File:');
const NORMALIZED_IN_TREE = patch('*** Add File: src/../src/a.js', '+export const a = 1;');

describe('decideGuard() — exec_command git diff/show ext-diff pin', () => {
  it('Given an exec_command payload whose cmd is "git diff", when decideGuard runs, then it blocks with the ext-diff reason', () => {
    const sut = decideGuard;

    const result = sut(execPayload('git diff'));

    assert.equal(result.block, true);
    assert.ok(result.reason.includes('--no-ext-diff'));
  });

  it('Given an exec_command payload whose cmd carries --no-ext-diff, when decideGuard runs, then it does not block', () => {
    const sut = decideGuard;

    const result = sut(execPayload('git diff --no-ext-diff HEAD'));

    assert.equal(result.block, false);
  });

  it('Given an exec_command payload whose cmd carries rtk proxy, when decideGuard runs, then it does not block', () => {
    const sut = decideGuard;

    const result = sut(execPayload('rtk proxy git diff'));

    assert.equal(result.block, false);
  });
});

describe('decideGuard() — exec_command cmd must be a string, never an argv array', () => {
  it('Given an exec_command payload whose cmd is an argv array, when decideGuard runs, then it blocks (fail-closed)', () => {
    const sut = decideGuard;

    const result = sut(execPayload(['git', 'diff']));

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — real codex hook payload shape (live-captured, Claude-style)', () => {
  // codex 0.144.6 PreToolUse payloads are Claude-shaped, NOT codex-internal: tool_name is
  // "Bash"/"apply_patch" and the command OR patch text lives in tool_input.command, with cwd
  // on the payload root. Pinned by dumping the live hook stdin. The prior model
  // (exec_command/cmd, patch in input/patch/text) never matched, so every real call threw in
  // adaptCodexEvent and failed closed — the guard blocked EVERY command while appearing to work.
  const realBash = (command) => ({ cwd: WORKING_DIR, tool_name: 'Bash', tool_input: { command } });
  const realPatch = (command) => ({ cwd: WORKING_DIR, tool_name: 'apply_patch', tool_input: { command } });

  it('Given the real Bash payload for a bare git diff, when decideGuard runs, then it blocks with the ext-diff reason', () => {
    const sut = decideGuard;

    const result = sut(realBash('git diff'));

    assert.equal(result.block, true);
    assert.ok(result.reason.includes('--no-ext-diff'));
  });

  it('Given the real Bash payload for a benign command, when decideGuard runs, then it does NOT block (regression: the guard must not fail closed on every command)', () => {
    const sut = decideGuard;

    const result = sut(realBash('echo hello'));

    assert.equal(result.block, false);
  });

  it('Given the real apply_patch payload writing in-tree, when decideGuard runs, then it does NOT block', () => {
    const sut = decideGuard;

    const result = sut(realPatch(IN_TREE_ADD));

    assert.equal(result.block, false);
  });

  it('Given the real apply_patch payload escaping the working dir, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(realPatch(DECOY_MULTI_HUNK));

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — apply_patch single in-tree hunk', () => {
  it('Given an apply_patch payload whose single hunk writes inside the working dir, when decideGuard runs, then it does not block', () => {
    const sut = decideGuard;

    const result = sut(patchPayload(IN_TREE_ADD));

    assert.equal(result.block, false);
  });
});

describe('decideGuard() — apply_patch multi-hunk decoy', () => {
  it('Given an apply_patch payload whose first hunk is in-tree and whose second escapes the working dir, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(patchPayload(DECOY_MULTI_HUNK));

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — apply_patch rename destination containment', () => {
  it('Given an apply_patch payload whose Move to destination escapes the working dir, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(patchPayload(RENAME_ESCAPE));

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — apply_patch absolute delete containment', () => {
  it('Given an apply_patch payload naming an absolute out-of-tree delete, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(patchPayload(DELETE_ABSOLUTE));

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — apply_patch with zero extractable paths fails closed', () => {
  it('Given an apply_patch payload whose patch body names no path at all, when decideGuard runs, then it blocks (fail-closed)', () => {
    const sut = decideGuard;

    const result = sut(patchPayload(NO_PATH_AT_ALL));

    assert.equal(result.block, true);
  });

  it('Given an apply_patch payload whose patch text is absent from every candidate field, when decideGuard runs, then it blocks (fail-closed)', () => {
    const sut = decideGuard;
    const event = { cwd: WORKING_DIR, tool_name: 'apply_patch', tool_input: {} };

    const result = sut(event);

    assert.equal(result.block, true);
  });

  it('Given an apply_patch payload whose directive carries an empty path, when decideGuard runs, then it blocks (fail-closed)', () => {
    const sut = decideGuard;

    const result = sut(patchPayload(EMPTY_PATH));

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — apply_patch raw-string tool_input', () => {
  it('Given an apply_patch payload whose tool_input is itself the raw patch string, when decideGuard runs, then the patch is parsed and containment applies', () => {
    const sut = decideGuard;
    const event = { cwd: WORKING_DIR, tool_name: 'apply_patch', tool_input: DECOY_MULTI_HUNK };

    const result = sut(event);

    assert.equal(result.block, true);
  });

  // A blocking assertion alone cannot tell "parsed, then contained" from
  // "unresolvable, so failed closed" — both surface as block: true. Pinning an
  // in-tree raw string to block: false is what proves the branch resolves.
  it('Given an apply_patch payload whose tool_input is an in-tree raw patch string, when decideGuard runs, then it does not block', () => {
    const sut = decideGuard;
    const event = { cwd: WORKING_DIR, tool_name: 'apply_patch', tool_input: IN_TREE_ADD };

    const result = sut(event);

    assert.equal(result.block, false);
  });
});

describe('decideGuard() — apply_patch candidate text fields', () => {
  for (const field of ['input', 'patch', 'text']) {
    it(`Given an apply_patch payload carrying an in-tree patch in the ${field} field, when decideGuard runs, then it does not block`, () => {
      const sut = decideGuard;
      const event = { cwd: WORKING_DIR, tool_name: 'apply_patch', tool_input: { [field]: IN_TREE_ADD } };

      const result = sut(event);

      assert.equal(result.block, false);
    });

    it(`Given an apply_patch payload whose ${field} field carries an escaping patch, when decideGuard runs, then it blocks`, () => {
      const sut = decideGuard;
      const event = { cwd: WORKING_DIR, tool_name: 'apply_patch', tool_input: { [field]: DECOY_MULTI_HUNK } };

      const result = sut(event);

      assert.equal(result.block, true);
    });
  }
});

describe('decideGuard() — missing working directory fails closed', () => {
  it('Given a payload whose cwd is missing, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;
    const event = { tool_name: 'exec_command', tool_input: { cmd: 'ls' } };

    const result = sut(event);

    assert.equal(result.block, true);
  });

  it('Given a payload whose cwd is an empty string, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;
    const event = { cwd: '', tool_name: 'exec_command', tool_input: { cmd: 'ls' } };

    const result = sut(event);

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — unmapped tool names pass through', () => {
  for (const toolName of ['web_search', 'update_plan']) {
    it(`Given an unmapped tool name "${toolName}", when decideGuard runs, then it does not block`, () => {
      const sut = decideGuard;
      const event = { cwd: WORKING_DIR, tool_name: toolName, tool_input: {} };

      const result = sut(event);

      assert.equal(result.block, false);
    });
  }
});

describe('decideGuard() — prototype-pollution pin on tool names', () => {
  for (const toolName of ['__proto__', 'constructor']) {
    it(`Given a tool name of "${toolName}", when decideGuard runs, then it falls through to the raw name rather than resolving an inherited member`, () => {
      const sut = decideGuard;
      const event = { cwd: WORKING_DIR, tool_name: toolName, tool_input: {} };
      let result;

      assert.doesNotThrow(() => {
        result = sut(event);
      });

      assert.equal(result.block, false);
    });
  }
});

describe('decideGuard() — structurally hostile payloads never throw', () => {
  const cases = [
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['a numeric tool_name', { tool_name: 42 }],
  ];

  for (const [label, payload] of cases) {
    it(`Given ${label} as payload, when decideGuard runs, then it returns a blocking verdict rather than throwing`, () => {
      const sut = decideGuard;
      let result;

      assert.doesNotThrow(() => {
        result = sut(payload);
      });

      assert.equal(result.block, true);
    });
  }
});

describe('decideGuard() — a throwing guard still fails closed', () => {
  it('Given an injected guard that throws, when decideGuard runs, then it returns { block: true }', () => {
    const sut = decideGuard;
    const throwingGuard = () => {
      throw new Error('boom');
    };

    const result = sut(execPayload('ls'), throwingGuard);

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — containment is resolution-based, not string-prefix-based', () => {
  it('Given a path containing .. that normalises back inside the working dir, when decideGuard runs, then it does not block', () => {
    const sut = decideGuard;

    const result = sut(patchPayload(NORMALIZED_IN_TREE));

    assert.equal(result.block, false);
  });
});
