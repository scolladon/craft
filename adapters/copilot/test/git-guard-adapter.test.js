import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { adaptCopilotEvent, buildAuditEntry, decideGuard } from '../src/git-guard-adapter.js';

const WORKING_DIR = '/repo';

function payload(toolName, argsObj, cwd = WORKING_DIR) {
  return { sessionId: 's1', timestamp: 0, cwd, toolName, toolArgs: JSON.stringify(argsObj) };
}

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

const OBSERVER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'hooks',
  'craft-observer.js',
);
const PROVENANCE_REF = /\b(ADR-?\d+|P\d+|Part\s+\d+|backlog\s*#\d+)\b/i;

function readObserverText() {
  return readFileSync(OBSERVER_PATH, 'utf8');
}

describe('hooks/craft-observer.js — thin wrapper structure', () => {
  it('Given the observer source text, when scanned, then it imports the tested adapter seam', () => {
    const sut = readObserverText();

    assert.match(sut, /\.\.\/src\/git-guard-adapter\.js/);
  });

  it('Given the observer source text, when scanned, then it imports the tested craft-root seam', () => {
    const sut = readObserverText();

    assert.match(sut, /\.\.\/src\/craft-root\.js/);
    assert.match(sut, /resolveCraftRoot/);
  });

  it('Given the observer source text, when scanned, then it sets process.env.CRAFT_ROOT', () => {
    const sut = readObserverText();

    assert.match(sut, /process\.env\.CRAFT_ROOT/);
  });

  it('Given the observer source text, when scanned, then process.env.CRAFT_ROOT is assigned inside main()\'s try block, not at module top level', () => {
    const sut = readObserverText();
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

  it('Given the observer source text, when scanned, then it builds the audit line via the tested buildAuditEntry seam', () => {
    const sut = readObserverText();

    assert.match(sut, /buildAuditEntry/);
  });

  it('Given the observer source text, when scanned, then it carries no phase/ADR/backlog reference', () => {
    const sut = readObserverText();

    assert.doesNotMatch(sut, PROVENANCE_REF);
  });
});
