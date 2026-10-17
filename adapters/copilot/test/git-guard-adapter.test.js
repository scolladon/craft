import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { COMPLEX_NEAR_GIT_REASON } from '../../../engine/src/guards/git-plain-command-gate.js';
import { adaptCopilotEvent, buildAuditEntry, copilotGuard, decideGuard } from '../src/git-guard-adapter.js';

const WORKING_DIR = '/repo';

function payload(toolName, argsObj, cwd = WORKING_DIR) {
  return { sessionId: 's1', timestamp: 0, cwd, toolName, toolArgs: JSON.stringify(argsObj) };
}

function objectPayload(toolName, argsObj, cwd = WORKING_DIR) {
  return { sessionId: 's1', timestamp: 0, cwd, toolName, toolArgs: argsObj };
}

describe('decideGuard() — object-shaped toolArgs', () => {
  it('Given an object toolArgs running ls, when decideGuard runs, then it passes', () => {
    const sut = decideGuard;

    const result = sut(objectPayload('bash', { command: 'ls' }));

    assert.equal(result.block, false);
  });

  it('Given an object toolArgs running git diff HEAD, when decideGuard runs, then it blocks with the ext-diff reason', () => {
    const sut = decideGuard;

    const result = sut(objectPayload('bash', { command: 'git diff HEAD' }));

    assert.equal(result.block, true);
    assert.ok(result.reason.includes('--no-ext-diff'));
  });

  it('Given an object toolArgs creating an in-tree file, when decideGuard runs, then it passes', () => {
    const sut = decideGuard;

    const result = sut(objectPayload('create', { path: '/repo/src/a.js', file_text: 'x' }));

    assert.equal(result.block, false);
  });
});

describe('decideGuard() — bash git diff/show without --no-ext-diff', () => {
  it('Given a lowercase bash call running git diff HEAD, when decideGuard runs, then it blocks with the ext-diff reason', () => {
    const sut = decideGuard;

    const result = sut(payload('bash', { command: 'git diff HEAD' }));

    assert.equal(result.block, true);
    assert.ok(result.reason.includes('--no-ext-diff'));
  });

  it('Given a lowercase bash call carrying --no-ext-diff, when decideGuard runs, then it passes', () => {
    const sut = decideGuard;

    const result = sut(payload('bash', { command: 'git diff --no-ext-diff HEAD' }));

    assert.equal(result.block, false);
  });

  it('Given a lowercase bash call carrying rtk proxy, when decideGuard runs, then it passes', () => {
    const sut = decideGuard;

    const result = sut(payload('bash', { command: 'rtk proxy git diff HEAD' }));

    assert.equal(result.block, false);
  });
});

describe('decideGuard() — create path containment', () => {
  it('Given a lowercase create call whose path is inside cwd, when decideGuard runs, then it passes', () => {
    const sut = decideGuard;

    const result = sut(payload('create', { path: `${WORKING_DIR}/src/file.js`, file_text: 'x' }));

    assert.equal(result.block, false);
  });

  it('Given a lowercase create call whose path escapes cwd via ../, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(payload('create', { path: '../secret.txt', file_text: 'x' }));

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — edit path containment', () => {
  it('Given a lowercase edit call whose path is inside cwd, when decideGuard runs, then it passes', () => {
    const sut = decideGuard;

    const result = sut(
      payload('edit', { path: `${WORKING_DIR}/src/file.js`, old_str: 'a', new_str: 'b' }),
    );

    assert.equal(result.block, false);
  });

  it('Given a lowercase edit call whose path escapes cwd via ../, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(payload('edit', { path: '../secret.txt', old_str: 'a', new_str: 'b' }));

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — fail-closed on a write tool with no path', () => {
  it('Given a create call whose args omit path, when decideGuard runs, then it blocks rather than resolving to the working dir', () => {
    const sut = decideGuard;

    const result = sut(payload('create', { file_text: 'x' }));

    assert.equal(result.block, true);
  });

  it('Given a create call whose path is an empty string, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(payload('create', { path: '', file_text: 'x' }));

    assert.equal(result.block, true);
  });

  it('Given an edit call whose args omit path, when decideGuard runs, then it blocks rather than resolving to the working dir', () => {
    const sut = decideGuard;

    const result = sut(payload('edit', { old_str: 'a', new_str: 'b' }));

    assert.equal(result.block, true);
  });

  it('Given a bash call whose args omit path, when decideGuard runs, then it still passes (path is only required for write tools)', () => {
    const sut = decideGuard;

    const result = sut(payload('bash', { command: 'ls' }));

    assert.equal(result.block, false);
  });
});

describe('normalizeToolName() — own-property casing lookup, not prototype-inherited', () => {
  it('Given a payload whose toolName is "constructor", when the adapted event is inspected, then the raw name passes through rather than resolving Object.prototype.constructor', () => {
    const sut = adaptCopilotEvent;

    const result = sut(payload('constructor', { command: 'ls' }));

    assert.equal(result.tool, 'constructor');
  });

  it('Given a payload whose toolName is "__proto__", when the adapted event is inspected, then the raw name passes through unresolved', () => {
    const sut = adaptCopilotEvent;

    const result = sut(payload('__proto__', { command: 'ls' }));

    assert.equal(result.tool, '__proto__');
  });
});

describe('buildAuditEntry() — attributable audit record', () => {
  it('Given a blocked create payload, when buildAuditEntry runs, then the entry carries toolName, the resolved path, and the verdict', () => {
    const sut = buildAuditEntry;

    const result = sut(payload('create', { path: '../secret.txt', file_text: 'SENSITIVE_BODY' }), {
      block: true,
    });

    assert.equal(result.toolName, 'create');
    assert.equal(result.path, '../secret.txt');
    assert.equal(result.block, true);
  });

  it('Given a blocked create payload carrying file_text, when buildAuditEntry runs, then the serialized entry never includes the file body', () => {
    const sut = buildAuditEntry;

    const result = sut(payload('create', { path: '../secret.txt', file_text: 'SENSITIVE_BODY' }), {
      block: true,
    });

    assert.ok(!JSON.stringify(result).includes('SENSITIVE_BODY'));
  });

  it('Given a payload with malformed toolArgs, when buildAuditEntry runs, then it still attributes toolName without throwing', () => {
    const sut = buildAuditEntry;

    const result = sut({ cwd: WORKING_DIR, toolName: 'create', toolArgs: '{not json' }, { block: true });

    assert.equal(result.toolName, 'create');
    assert.equal(result.path, undefined);
  });

  it('Given a passing bash payload, when buildAuditEntry runs, then the entry carries the verdict alongside toolName', () => {
    const sut = buildAuditEntry;

    const result = sut(payload('bash', { command: 'ls' }), { block: false });

    assert.equal(result.toolName, 'bash');
    assert.equal(result.block, false);
  });
});

describe('decideGuard() — the decoy: an in-tree file_path must not mask an out-of-tree path', () => {
  it('Given a create call with an in-tree file_path and an out-of-tree path, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;
    const decoyPayload = {
      cwd: '/repo',
      toolName: 'create',
      toolArgs: JSON.stringify({
        file_path: '/repo/innocent.txt',
        path: '/etc/passwd',
        file_text: 'x',
      }),
    };

    const result = sut(decoyPayload);

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — fail-closed toolArgs parsing', () => {
  it('Given a payload whose toolArgs is not valid JSON, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut({ cwd: WORKING_DIR, toolName: 'bash', toolArgs: '{not json' });

    assert.equal(result.block, true);
  });

  it('Given a payload with no toolArgs field, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut({ cwd: WORKING_DIR, toolName: 'bash' });

    assert.equal(result.block, true);
  });

  it('Given a toolArgs that JSON-encodes a string, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut({ cwd: WORKING_DIR, toolName: 'bash', toolArgs: '"a string"' });

    assert.equal(result.block, true);
  });

  it('Given a toolArgs that JSON-encodes a number, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut({ cwd: WORKING_DIR, toolName: 'bash', toolArgs: '42' });

    assert.equal(result.block, true);
  });

  it('Given a toolArgs that JSON-encodes null, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut({ cwd: WORKING_DIR, toolName: 'bash', toolArgs: 'null' });

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — non-object toolArgs shapes', () => {
  const HOSTILE_TOOL_ARGS = [
    ['an empty JSON array string', '[]'],
    ['a JSON array string holding a command object', '[{"command":"git diff"}]'],
    ['an array', []],
    ['a number', 42],
    ['a boolean', true],
    ['null', null],
  ];

  for (const [label, toolArgs] of HOSTILE_TOOL_ARGS) {
    it(`Given a toolArgs that is ${label}, when decideGuard runs, then it blocks`, () => {
      const sut = decideGuard;

      const result = sut({ cwd: WORKING_DIR, toolName: 'bash', toolArgs });

      assert.equal(result.block, true);
    });
  }
});

describe('copilotGuard() — destructive git first, then the tool-call guard', () => {
  const bashEvent = command => ({ tool: 'Bash', tool_input: { command }, working_dir: WORKING_DIR });

  it('Given a git -C . push command, when copilotGuard runs, then it blocks with the push reason', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent('git -C . push'));

    assert.equal(result.block, true);
    assert.match(result.reason, /push/);
  });

  it('Given a push chained before a git diff, when copilotGuard runs, then the push reason wins', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent('git push; git diff'));

    assert.match(result.reason, /push/);
  });

  it('Given a wrapped push, when copilotGuard runs, then the plain-command gate reason wins', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent("bash -c 'git push'"));

    assert.deepEqual(result, {
      block: true,
      reason: COMPLEX_NEAR_GIT_REASON,
    });
  });

  it('Given a heredoc commit idiom whose body closes the substitution before a forced branch delete, when copilotGuard runs, then the plain-command gate reason wins', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent('git commit -m "$(cat <<\'EOF\'\nx)"; git branch -D victim; echo "\nEOF\n)"'));

    assert.deepEqual(result, {
      block: true,
      reason: COMPLEX_NEAR_GIT_REASON,
    });
  });

  it('Given a shell behind an unlisted wrapper, when copilotGuard runs, then the plain-command gate reason wins', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent("caffeinate bash run.sh; git status"));

    assert.deepEqual(result, {
      block: true,
      reason: COMPLEX_NEAR_GIT_REASON,
    });
  });

  it('Given a prefixed GIT_CONFIG_ variable, when copilotGuard runs, then the gate blocks with its reason', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent('MY_GIT_CONFIG_COUNT=1 git status'));

    assert.deepEqual(result, {
      block: true,
      reason: COMPLEX_NEAR_GIT_REASON,
    });
  });

  it('Given an fsmonitor config running a push, when copilotGuard runs, then the gate blocks with its reason', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent("git -c core.fsmonitor='git push origin main' status"));

    assert.deepEqual(result, {
      block: true,
      reason: COMPLEX_NEAR_GIT_REASON,
    });
  });

  it('Given a safe inline identity config, when copilotGuard runs, then it passes', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent('git -c user.name=p -c user.email=p@p commit -m x'));

    assert.equal(result.block, false);
  });

  it('Given a plain status through the whole guard, when copilotGuard runs, then it passes', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent('git status --short && git log --oneline -5'));

    assert.equal(result.block, false);
  });

  it('Given a Write out of tree, when copilotGuard runs, then the tool-call guard still blocks', () => {
    const sut = copilotGuard;

    const result = sut({
      tool: 'Write',
      tool_input: { file_path: '/etc/passwd' },
      working_dir: WORKING_DIR,
    });

    assert.equal(result.block, true);
  });

  it('Given a harmless Bash command, when copilotGuard runs, then it passes', () => {
    const sut = copilotGuard;

    const result = sut(bashEvent('ls'));

    assert.equal(result.block, false);
  });

  it('Given a Bash event without a command, when copilotGuard runs, then it passes', () => {
    const sut = copilotGuard;

    const result = sut({ tool: 'Bash', tool_input: {}, working_dir: WORKING_DIR });

    assert.equal(result.block, false);
  });
});

describe('decideGuard() — default guard composes the destructive-git predicate', () => {
  it('Given a bash git push, when decideGuard runs with its default guard, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(payload('bash', { command: 'git push' }));

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — never throws', () => {
  it('Given an undefined payload, when decideGuard runs, then it returns a verdict rather than throwing', () => {
    const sut = decideGuard;

    const result = sut(undefined);

    assert.equal(typeof result, 'object');
    assert.equal(result.block, true);
  });

  it('Given a null payload, when decideGuard runs, then it returns a verdict rather than throwing', () => {
    const sut = decideGuard;

    const result = sut(null);

    assert.equal(typeof result, 'object');
    assert.equal(result.block, true);
  });

  it('Given a payload whose cwd is absent, when decideGuard runs, then it returns a verdict rather than throwing', () => {
    const sut = decideGuard;

    const result = sut({ toolName: 'bash', toolArgs: JSON.stringify({ command: 'ls' }) });

    assert.equal(typeof result, 'object');
  });

  it('Given a guard injection that throws, when decideGuard runs, then it returns block: true rather than throwing', () => {
    const sut = decideGuard;
    const throwingGuard = () => {
      throw new Error('boom');
    };

    const result = sut(payload('bash', { command: 'ls' }), throwingGuard);

    assert.equal(result.block, true);
  });
});

describe('decideGuard() — unmapped tools pass through unblocked', () => {
  for (const toolName of ['view', 'glob', 'task']) {
    it(`Given an unmapped lowercase tool (${toolName}), when decideGuard runs, then it passes through unblocked`, () => {
      const sut = decideGuard;

      const result = sut(payload(toolName, { path: '/etc/passwd' }));

      assert.equal(result.block, false);
    });
  }
});

describe('adaptCopilotEvent() — working_dir mapping', () => {
  it("Given a bash payload, when the adapted event is inspected, then working_dir carries the payload's cwd", () => {
    const sut = adaptCopilotEvent;

    const result = sut(payload('bash', { command: 'ls' }, '/some/cwd'));

    assert.equal(result.working_dir, '/some/cwd');
  });
});

const GUARD_HOOK_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'hooks',
  'craft-guard.js',
);
const GUARD_WORKER_PATH = join(dirname(GUARD_HOOK_PATH), 'craft-guard-worker.js');
const PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;

function readGuardHookText() {
  return readFileSync(GUARD_HOOK_PATH, 'utf8');
}

describe('hooks/craft-guard.js — thin wrapper structure', () => {
  it('Given the guard worker source text, when scanned, then it imports the tested adapter seam', () => {
    const sut = readFileSync(GUARD_WORKER_PATH, 'utf8');

    assert.match(sut, /\.\.\/src\/git-guard-adapter\.js/);
  });

  it('Given the guard hook source text, when scanned, then it imports the tested craft-root seam', () => {
    const sut = readGuardHookText();

    assert.match(sut, /\.\.\/src\/craft-root\.js/);
    assert.match(sut, /resolveCraftRoot/);
  });

  it('Given the guard hook source text, when scanned, then it sets process.env.CRAFT_ROOT', () => {
    const sut = readGuardHookText();

    assert.match(sut, /process\.env\.CRAFT_ROOT/);
  });

  it('Given the guard hook source text, when scanned, then process.env.CRAFT_ROOT is assigned inside main()\'s try block, not at module top level', () => {
    const sut = readGuardHookText();
    const tryIndex = sut.indexOf('try {');
    const craftRootIndex = sut.indexOf('process.env.CRAFT_ROOT');
    const catchIndex = sut.indexOf('} catch');

    assert.ok(tryIndex !== -1, 'expected a try block');
    assert.ok(catchIndex > tryIndex, 'expected a matching catch after the try');
    assert.ok(
      craftRootIndex > tryIndex && craftRootIndex < catchIndex,
      'expected the CRAFT_ROOT assignment between try and catch',
    );
  });

  it('Given the guard worker source text, when scanned, then it builds the audit line via the tested buildAuditEntry seam', () => {
    const sut = readFileSync(GUARD_WORKER_PATH, 'utf8');

    assert.match(sut, /buildAuditEntry/);
  });

  it('Given the guard hook source text, when scanned, then it carries no phase/ADR/backlog reference', () => {
    const sut = readGuardHookText();

    assert.doesNotMatch(sut, PROVENANCE_REF);
  });
});

describe('decideGuard() — fail-closed reasons and command typing', () => {
  it('Given unparseable toolArgs, when decideGuard runs, then it blocks with a reason naming the failure', () => {
    const sut = decideGuard;

    const result = sut({ toolName: 'bash', toolArgs: '{', cwd: '/tmp' });

    assert.equal(result.block, true);
    assert.match(result.reason, /^craft: guard could not read the tool call \(.+\) — denied fail-closed$/);
  });

  it('Given a non-Error throw from the guard, when decideGuard runs, then it blocks with a reason without a message', () => {
    const sut = decideGuard;

    const result = sut(objectPayload('bash', { command: 'ls' }), () => {
      throw null;
    });

    assert.deepEqual(result, {
      block: true,
      reason: 'craft: guard could not read the tool call (unknown error) — denied fail-closed',
    });
  });

  it('Given an array command in string toolArgs, when decideGuard runs, then it blocks', () => {
    const sut = decideGuard;

    const result = sut(payload('bash', { command: ['git push'] }));

    assert.equal(result.block, true);
    assert.match(result.reason, /command/);
  });

  it('Given an array command on a Bash event, when copilotGuard runs, then it throws', () => {
    const sut = copilotGuard;

    assert.throws(() => sut({ tool: 'Bash', tool_input: { command: ['git push'] }, working_dir: '/tmp' }), /command/);
  });
});

describe('copilotGuard() — containment denial reason', () => {
  it('Given a create outside the working directory, when copilotGuard runs, then the denial carries a reason', () => {
    const sut = copilotGuard;

    const result = sut({ tool: 'Write', tool_input: { file_path: '/etc/x' }, working_dir: '/repo' });

    assert.equal(result.block, true);
    assert.equal(result.reason, 'craft: write outside the working directory is denied in this binding');
  });
});

describe('decideGuard() — fail-closed reasons', () => {
  const failClosed = detail => ({
    block: true,
    reason: `craft: guard could not read the tool call (${detail}) — denied fail-closed`,
  });

  for (const [title, toolArgs] of [
    ['null toolArgs', 'null'],
    ['an array toolArgs', '[]'],
    ['a number toolArgs', '5'],
  ]) {
    it(`Given ${title}, when decideGuard runs, then it fails closed naming the plain-object requirement`, () => {
      const sut = decideGuard;

      const result = sut({ cwd: WORKING_DIR, toolName: 'bash', toolArgs });

      assert.deepEqual(result, failClosed('toolArgs did not decode to a plain JSON object'));
    });
  }

  for (const [title, thrown] of [
    ['an empty message', new Error('')],
    ['a non-string message', { message: 5 }],
    ['a nullish throw', null],
  ]) {
    it(`Given a guard throwing ${title}, when decideGuard runs, then the reason says unknown error`, () => {
      const sut = decideGuard;

      const result = sut(payload('bash', { command: 'ls' }), () => {
        throw thrown;
      });

      assert.deepEqual(result, failClosed('unknown error'));
    });
  }
});

describe('copilotGuard() — verdict shapes', () => {
  it('Given a create call inside the working directory, when guarded, then the verdict is exactly a pass', () => {
    const sut = copilotGuard;

    const result = sut({ tool: 'Write', tool_input: { file_path: `${WORKING_DIR}/a.js` }, working_dir: WORKING_DIR });

    assert.deepEqual(result, { block: false });
  });

  it('Given a read-only tool, when guarded, then the verdict is exactly a pass', () => {
    const sut = copilotGuard;

    const result = sut({ tool: 'view', tool_input: { path: '/etc/passwd' }, working_dir: WORKING_DIR });

    assert.deepEqual(result, { block: false });
  });
});
