import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile as realExecFile } from 'node:child_process';
import { resolveGateCommand, isFloorViolation, spawnPi, runGate, main } from '../src/run.js';
import { rolelessSteps as _realRolelessSteps } from '../src/roleless.js';

// Canned 11-phase resolution — mirrors design §entrypoint consumes lines 66-79 (effective[] order)
const CANNED_GATE_DECISIONS = [
  { phaseId: 'workspace',       gate: '',                  codeProducing: false },
  { phaseId: 'design',          gate: '',                  codeProducing: false },
  { phaseId: 'decisions',       gate: '',                  codeProducing: false },
  { phaseId: 'planning',        gate: 'plan-lint',         codeProducing: false },
  { phaseId: 'implementation',  gate: '<gates.phase>',     codeProducing: true  },
  { phaseId: 'review',          gate: '<gates.phase>',     codeProducing: false },
  { phaseId: 'refactoring',     gate: '<gates.phase>',     codeProducing: true  },
  { phaseId: 'validation',      gate: '<validation gate>', codeProducing: false },
  { phaseId: 'documentation',   gate: '',                  codeProducing: false },
  { phaseId: 'propose',         gate: 'pr.pre-pr-gate',    codeProducing: false },
  { phaseId: 'integrate',       gate: '',                  codeProducing: false },
];

const CANNED_EFFECTIVE = [
  { id: 'workspace',      archetype: 'setup',          role: undefined, model: undefined,  gate: ''                  },
  { id: 'design',         archetype: 'specification',  role: 'craft:designer',             model: 'opus',   gate: ''                  },
  { id: 'decisions',      archetype: 'specification',  role: undefined, model: undefined,  gate: ''                  },
  { id: 'planning',       archetype: 'specification',  role: 'craft:planner',              model: 'opus',   gate: 'plan-lint'         },
  { id: 'implementation', archetype: 'construction',   role: 'craft:part-implementer',    model: 'sonnet', gate: '<gates.phase>'     },
  { id: 'review',         archetype: 'harness',        role: 'craft:reviewer',             model: 'opus',   gate: '<gates.phase>'     },
  { id: 'refactoring',    archetype: 'refinement',     role: 'craft:refactor-executor',    model: 'sonnet', gate: '<gates.phase>'     },
  { id: 'validation',     archetype: 'harness',        role: 'craft:validation-triager',   model: 'sonnet', gate: '<validation gate>' },
  { id: 'documentation',  archetype: 'delivery',       role: 'craft:docs-writer',          model: 'sonnet', gate: ''                  },
  { id: 'propose',        archetype: 'delivery',       role: undefined, model: undefined,  gate: 'pr.pre-pr-gate'    },
  { id: 'integrate',      archetype: 'delivery',       role: undefined, model: undefined,  gate: ''                  },
];

const CANNED_RESOLUTION = Object.freeze({
  ok: true,
  effective: CANNED_EFFECTIVE,
  gateDecisions: CANNED_GATE_DECISIONS,
  record: {},
  errors: [],
  waivers: [],
});

const WORKER_IDS = ['design', 'planning', 'implementation', 'review', 'refactoring', 'validation', 'documentation'];
const ROLELESS_IDS = ['workspace', 'decisions', 'propose', 'integrate'];

const WALK_MANIFEST = Object.freeze({ gates: { phase: 'node --test' } });

const USAGE_JSONL = '{"type":"message_end","message":{"usage":{"input":10,"output":20}}}\n';

function makeRecordingSpawnPi(override = {}) {
  const calls = [];
  async function spawnPiDouble(argv, opts) {
    calls.push({ argv, opts });
    if (override.rejectOn && argv.join(' ').includes(override.rejectOn)) {
      const err = new Error(`{ unit: pi-run, reason: non-zero }`);
      throw err;
    }
    return override.stdout ?? USAGE_JSONL;
  }
  return { spawnPiDouble, calls };
}

function makeRecordingAssembleBlock() {
  const calls = [];
  async function assembleBlockDouble(phaseId, manifestPath) {
    calls.push({ phaseId, manifestPath });
    return `block-for-${phaseId}`;
  }
  return { assembleBlockDouble, calls };
}

function makeRecordingRunGate(override = {}) {
  const calls = [];
  async function runGateDouble(command, opts) {
    calls.push({ command, opts });
    if (override.rejectOn && command.includes(override.rejectOn)) {
      throw new Error(`{ unit: gate, reason: red }`);
    }
    if (override.rejectAll) {
      throw new Error(`{ unit: gate, reason: red }`);
    }
    return 'ok';
  }
  return { runGateDouble, calls };
}

function makeRecordingRolelessSteps(override = {}) {
  const calls = {};
  const steps = {};
  for (const id of ROLELESS_IDS) {
    steps[id] = async (...args) => {
      calls[id] = args;
      if (override.blockOn === id) {
        return { ok: false, record: '', blocker: { unit: id, reason: 'test blocker' } };
      }
      return { ok: true, record: `${id}: recorded` };
    };
  }
  return { steps, calls };
}

function makeDeps(overrides = {}) {
  const { spawnPiDouble } = makeRecordingSpawnPi();
  const { assembleBlockDouble } = makeRecordingAssembleBlock();
  const { runGateDouble } = makeRecordingRunGate();
  const { steps: rolelessSteps } = makeRecordingRolelessSteps();
  return {
    resolvePipeline: async () => CANNED_RESOLUTION,
    assembleBlock: assembleBlockDouble,
    spawnPi: spawnPiDouble,
    runGate: runGateDouble,
    loadManifest: () => WALK_MANIFEST,
    rolelessSteps,
    env: {},
    cwd: '/fake/cwd',
    ...overrides,
  };
}

const IO_NULL = { stdout: { write: () => {} }, stderr: { write: () => {} } };

function makeIo() {
  const output = { stdout: [], stderr: [] };
  return {
    io: {
      stdout: { write: (s) => output.stdout.push(s) },
      stderr: { write: (s) => output.stderr.push(s) },
    },
    output,
  };
}

describe('main() — full 11-phase walk', () => {
  it('Given a canned 11-phase resolution, when main walks, then the 7 worker phases each call spawnPi once in order and the 4 role-less phases call their rolelessSteps double, not spawnPi', async () => {
    const spawnRec = makeRecordingSpawnPi();
    const assembleRec = makeRecordingAssembleBlock();
    const { steps: rolelessSteps, calls: rolelessCalls } = makeRecordingRolelessSteps();
    const deps = makeDeps({
      spawnPi: spawnRec.spawnPiDouble,
      assembleBlock: assembleRec.assembleBlockDouble,
      rolelessSteps,
    });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 0);
    // Assert 7 worker phases spawned in pipeline order
    const spawnedIds = spawnRec.calls.map((c) => c.argv[3]?.match(/^block-for-(\w+)/)?.[1] ?? '');
    assert.deepEqual(spawnedIds, WORKER_IDS);
    // Assert exactly 7 worker phase assembles in order
    const assembledIds = assembleRec.calls.map((c) => c.phaseId);
    assert.deepEqual(assembledIds, WORKER_IDS);
    // Assert 4 role-less steps called, not spawned
    for (const id of ROLELESS_IDS) {
      assert.ok(rolelessCalls[id] !== undefined, `roleless step ${id} must be called`);
    }
  });

  it('Given resolution.ok is false, when main runs, then it returns 2, writes errors to stderr, and spawns nothing', async () => {
    const spawnRec = makeRecordingSpawnPi();
    const { io, output } = makeIo();
    const deps = makeDeps({
      resolvePipeline: async () => ({ ok: false, errors: ['bad pipeline'], effective: [], gateDecisions: [] }),
      spawnPi: spawnRec.spawnPiDouble,
    });

    const sut = main;
    const result = await sut([], io, deps);

    assert.equal(result.code, 2);
    assert.equal(spawnRec.calls.length, 0);
    assert.ok(output.stderr.join('').includes('bad pipeline'), 'errors written to stderr');
  });

  it('Given assembleBlock receives the manifest path, when main walks, then the path is threaded (DC-MAN)', async () => {
    const assembleRec = makeRecordingAssembleBlock();
    const deps = makeDeps({
      assembleBlock: assembleRec.assembleBlockDouble,
      loadManifest: () => WALK_MANIFEST,
    });

    const sut = main;
    await sut([], IO_NULL, deps);

    assert.ok(assembleRec.calls.length > 0, 'assembleBlock must be called');
    for (const call of assembleRec.calls) {
      assert.ok(call.manifestPath !== undefined, 'manifestPath must be passed to assembleBlock');
    }
  });

  it('Given a worker pi exit non-zero, when main walks, then it returns 2 and no later phase runs', async () => {
    const spawnRec = makeRecordingSpawnPi({ rejectOn: 'implementation' });
    const { steps: rolelessSteps } = makeRecordingRolelessSteps();
    const deps = makeDeps({
      spawnPi: (argv, opts) => {
        const promptStr = argv.join(' ');
        if (promptStr.includes('implementation')) {
          return Promise.reject(new Error('{ unit: pi-run, reason: non-zero }'));
        }
        spawnRec.calls.push({ argv, opts });
        return Promise.resolve(USAGE_JSONL);
      },
      rolelessSteps,
    });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 2);
    // review and refactoring must NOT have been spawned (they come after implementation)
    const called = spawnRec.calls.map((c) => c.argv.join(' '));
    assert.ok(!called.some((s) => s.includes('review')), 'review must not run after pi failure');
    assert.ok(!called.some((s) => s.includes('refactoring')), 'refactoring must not run after pi failure');
  });

  it('Given a red gate on implementation, when main walks, then it returns 2 and does not commit', async () => {
    const { runGateDouble } = makeRecordingRunGate({ rejectOn: 'node --test' });
    const spawnRec = makeRecordingSpawnPi();
    const deps = makeDeps({
      spawnPi: spawnRec.spawnPiDouble,
      runGate: runGateDouble,
    });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 2);
  });

  it('Given a red gate on refactoring, when main walks, then it returns 2', async () => {
    // Give refactoring a unique gate command so the double can fail it by command identity
    const refactoringGateDecisions = CANNED_GATE_DECISIONS.map((d) =>
      d.phaseId === 'refactoring' ? { ...d, gate: 'node-refactoring-gate' } : d,
    );
    const deps = makeDeps({
      resolvePipeline: async () => ({ ...CANNED_RESOLUTION, gateDecisions: refactoringGateDecisions }),
      runGate: async (command) => {
        if (command === 'node-refactoring-gate') {
          throw new Error('{ unit: gate, reason: red on refactoring }');
        }
        return 'ok';
      },
    });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 2);
  });

  it('Given an empty resolved gate on a code-producing phase, when main walks, then it returns 2 with a unit: gate blocker before any commit', async () => {
    // Manifest with no gates.phase → resolveGateCommand returns '' for implementation
    const emptyManifest = Object.freeze({});
    const deps = makeDeps({
      loadManifest: () => emptyManifest,
    });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 2);
  });

  it('Given a red validation gate, when main walks, then the propose step is not reached and main returns 2', async () => {
    const { steps: rolelessSteps, calls: rolelessCalls } = makeRecordingRolelessSteps();
    // Give validation a unique gate command so the double can fail it by command identity
    const validationGateDecisions = CANNED_GATE_DECISIONS.map((d) =>
      d.phaseId === 'validation' ? { ...d, gate: 'node-validation-gate' } : d,
    );
    const deps = makeDeps({
      rolelessSteps,
      resolvePipeline: async () => ({ ...CANNED_RESOLUTION, gateDecisions: validationGateDecisions }),
      runGate: async (command) => {
        if (command === 'node-validation-gate') {
          throw new Error('{ unit: gate, reason: red on validation }');
        }
        return 'ok';
      },
    });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 2);
    assert.ok(rolelessCalls['propose'] === undefined, 'propose must not run when validation gate is red');
  });

  it('Given a green validation gate, when main walks, then propose runs', async () => {
    const { steps: rolelessSteps, calls: rolelessCalls } = makeRecordingRolelessSteps();
    const deps = makeDeps({ rolelessSteps });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 0);
    assert.ok(rolelessCalls['propose'] !== undefined, 'propose must run when validation gate is green');
  });

  it('Given a --mode json stdout fixture, when a worker phase runs, then parseUsage result is recorded in the run record per worker phase', async () => {
    const usageFixture = JSON.stringify({ type: 'message_end', message: { usage: { input: 42, output: 7 } } }) + '\n';
    const deps = makeDeps({
      spawnPi: async () => usageFixture,
    });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 0);
    const workerRecords = result.runRecord.filter((r) => r.usage !== undefined);
    assert.ok(workerRecords.length === WORKER_IDS.length, 'each worker phase must have usage recorded');
    for (const r of workerRecords) {
      assert.equal(r.usage.input, 42);
      assert.equal(r.usage.output, 7);
    }
  });

  it('Given a role-less step returns a blocker, when main walks, then main returns 2', async () => {
    const { steps: rolelessSteps } = makeRecordingRolelessSteps({ blockOn: 'workspace' });
    const deps = makeDeps({ rolelessSteps });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 2);
  });

  it('Given a phase throws a blocker error, when main walks, then it writes the error message to stderr', async () => {
    const { steps: rolelessSteps } = makeRecordingRolelessSteps({ blockOn: 'workspace' });
    const { io, output } = makeIo();
    const deps = makeDeps({ rolelessSteps });

    const sut = main;
    await sut([], io, deps);

    assert.ok(output.stderr.join('').length > 0, 'stderr must contain the blocker message');
    assert.match(output.stderr.join(''), /workspace/, 'blocker unit must appear in stderr');
  });
});

const CANNED_MANIFEST = Object.freeze({
  gates: { phase: 'node --test' },
  pr: { 'pre-pr-gate': 'make pre-pr' },
});

const EMPTY_MANIFEST = Object.freeze({});

function makeDecision(phaseId, gate, codeProducing = false) {
  return { phaseId, gate, codeProducing };
}

describe('resolveGateCommand() — placeholder substitution', () => {
  it('Given the implementation phase and a manifest with gates.phase, when resolveGateCommand runs, then it returns node --test', () => {
    const sut = resolveGateCommand;
    const decision = makeDecision('implementation', '<gates.phase>', true);

    const result = sut(decision, CANNED_MANIFEST);

    assert.equal(result, 'node --test');
  });

  it('Given the refactoring phase and a manifest with gates.phase, when resolveGateCommand runs, then it returns node --test', () => {
    const sut = resolveGateCommand;
    const decision = makeDecision('refactoring', '<gates.phase>', true);

    const result = sut(decision, CANNED_MANIFEST);

    assert.equal(result, 'node --test');
  });

  it('Given the review phase and a manifest with gates.phase, when resolveGateCommand runs, then it returns node --test', () => {
    const sut = resolveGateCommand;
    const decision = makeDecision('review', '<gates.phase>', false);

    const result = sut(decision, CANNED_MANIFEST);

    assert.equal(result, 'node --test');
  });

  it('Given the validation phase with <validation gate>, when resolveGateCommand runs, then it returns manifest.gates.phase', () => {
    const sut = resolveGateCommand;
    const decision = makeDecision('validation', '<validation gate>', false);

    const result = sut(decision, CANNED_MANIFEST);

    assert.equal(result, 'node --test');
  });

  it('Given the propose phase with pr.pre-pr-gate, when resolveGateCommand runs, then it returns manifest.pr[pre-pr-gate]', () => {
    const sut = resolveGateCommand;
    const decision = makeDecision('propose', 'pr.pre-pr-gate', false);

    const result = sut(decision, CANNED_MANIFEST);

    assert.equal(result, 'make pre-pr');
  });

  it('Given the planning phase with plan-lint, when resolveGateCommand runs, then it passes through plan-lint unchanged', () => {
    const sut = resolveGateCommand;
    const decision = makeDecision('planning', 'plan-lint', false);

    const result = sut(decision, CANNED_MANIFEST);

    assert.equal(result, 'plan-lint');
  });

  it('Given a phase with empty gate, when resolveGateCommand runs, then it returns empty string', () => {
    const sut = resolveGateCommand;
    const decision = makeDecision('workspace', '', false);

    const result = sut(decision, CANNED_MANIFEST);

    assert.equal(result, '');
  });
});

describe('resolveGateCommand() — manifest absent keys', () => {
  it('Given a code-producing phase with <gates.phase> but manifest has no gates.phase, when resolveGateCommand runs, then it returns empty string', () => {
    const sut = resolveGateCommand;
    const decision = makeDecision('implementation', '<gates.phase>', true);

    const result = sut(decision, EMPTY_MANIFEST);

    assert.equal(result, '');
  });

  it('Given propose phase with pr.pre-pr-gate but manifest has no pr key, when resolveGateCommand runs, then it returns empty string', () => {
    const sut = resolveGateCommand;
    const decision = makeDecision('propose', 'pr.pre-pr-gate', false);

    const result = sut(decision, EMPTY_MANIFEST);

    assert.equal(result, '');
  });
});

describe('isFloorViolation() — code-producing floor classification', () => {
  it('Given a code-producing phase whose resolved gate is empty, when classified, then it is flagged as a floor violation', () => {
    const sut = isFloorViolation;
    const decision = makeDecision('implementation', '<gates.phase>', true);

    const result = sut('', decision);

    assert.equal(result, true);
  });

  it('Given a code-producing phase whose resolved gate is non-empty, when classified, then it is not a floor violation', () => {
    const sut = isFloorViolation;
    const decision = makeDecision('implementation', '<gates.phase>', true);

    const result = sut('node --test', decision);

    assert.equal(result, false);
  });

  it('Given a non-code-producing phase whose resolved gate is empty, when classified, then it is not a floor violation', () => {
    const sut = isFloorViolation;
    const decision = makeDecision('validation', '<validation gate>', false);

    const result = sut('', decision);

    assert.equal(result, false);
  });

  it('Given a non-code-producing phase whose resolved gate is non-empty, when classified, then it is not a floor violation', () => {
    const sut = isFloorViolation;
    const decision = makeDecision('review', '<gates.phase>', false);

    const result = sut('node --test', decision);

    assert.equal(result, false);
  });
});

function makeExecFileDouble() {
  const captured = {};
  const execFile = (file, args, options, cb) => {
    captured.file = file;
    captured.args = args;
    captured.options = options;
    captured.cb = cb;
  };
  return { execFile, captured };
}

describe('runSubprocess() — stdin discipline', () => {
  it('Given a real child blocked reading stdin, when runGate runs it, then the child sees EOF and the promise resolves before the timeout', async () => {
    let child = null;
    const capturing = (file, args, options, cb) => {
      child = realExecFile(file, args, options, cb);
      return child;
    };
    const sut = runGate;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("the child's stdin was never ended")), 2000);
    });

    try {
      const result = await Promise.race([sut('cat', { cwd: process.cwd() }, capturing), timeout]);

      assert.equal(result, '');
    } finally {
      clearTimeout(timer);
      child?.kill();
    }
  });
});

describe('spawnPi() — subprocess runner', () => {
  it('Given spawnPi is called, when it launches pi, then stdio[0] is ignore (stdin ignored)', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = spawnPi;
    const promise = sut(['--mode', 'json', 'prompt'], { cwd: '/tmp' }, execFile);
    captured.cb(null, 'OUT', '');

    await promise;

    assert.equal(captured.options.stdio[0], 'ignore');
  });

  it('Given spawnPi is called, when it launches pi, then it passes the argv array unchanged and the file is pi', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = spawnPi;
    const argv = ['--mode', 'json', 'the prompt'];
    const promise = sut(argv, { cwd: '/tmp' }, execFile);
    captured.cb(null, 'OUT', '');

    await promise;

    assert.equal(captured.file, 'pi');
    assert.deepEqual(captured.args, argv);
  });

  it('Given pi exits non-zero, when spawnPi runs, then it rejects with a pi-run blocker carrying stderr', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = spawnPi;
    const promise = sut(['arg'], { cwd: '/tmp' }, execFile);
    captured.cb(new Error('exit 1'), '', 'boom');

    await assert.rejects(promise, (err) => {
      assert.match(err.message, /unit: pi-run/);
      assert.match(err.message, /boom/);
      return true;
    });
  });

  it('Given pi exits zero, when spawnPi runs, then it resolves with stdout', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = spawnPi;
    const promise = sut(['arg'], { cwd: '/tmp' }, execFile);
    captured.cb(null, 'OUT', '');

    const result = await promise;

    assert.equal(result, 'OUT');
  });
});

describe('runGate() — gate subprocess runner', () => {
  it('Given a gate command string, when runGate runs, then it splits the command into file and args (no shell)', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = runGate;
    const promise = sut('node --test', { cwd: '/tmp' }, execFile);
    captured.cb(null, 'ok', '');

    await promise;

    assert.equal(captured.file, 'node');
    assert.deepEqual(captured.args, ['--test']);
  });

  it('Given the gate exits non-zero, when runGate runs, then it rejects with a gate blocker', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = runGate;
    const promise = sut('node --test', { cwd: '/tmp' }, execFile);
    captured.cb(new Error('exit 1'), '', 'fail');

    await assert.rejects(promise, (err) => {
      assert.match(err.message, /unit: gate/);
      return true;
    });
  });

  it('Given the gate exits zero, when runGate runs, then it resolves', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = runGate;
    const promise = sut('node --test', { cwd: '/tmp' }, execFile);
    captured.cb(null, 'ok', '');

    const result = await promise;

    assert.equal(result, 'ok');
  });
});

describe('main() — real rolelessSteps wiring integration', () => {
  it('Given real rolelessSteps with doubled probes (isGitRepo→true, hasRemote→false), main walks, it returns 0 and roleless records are present', async () => {
    // Probes are doubled — no real git/gh in unit tests
    const probeDeps = {
      gitProbe: { isGitRepo: () => true },
      hasRemote: () => false,
      ghAvailable: () => false,
      ghAuthed: () => false,
      gitPush: async () => {},
      ghPrCreate: async () => {},
    };

    const spawnRec = makeRecordingSpawnPi();
    const assembleRec = makeRecordingAssembleBlock();
    const { runGateDouble } = makeRecordingRunGate();
    const deps = makeDeps({
      spawnPi: spawnRec.spawnPiDouble,
      assembleBlock: assembleRec.assembleBlockDouble,
      runGate: runGateDouble,
      // Real rolelessSteps — not doubled; probes supplied via rolelessProbes DI
      rolelessSteps: _realRolelessSteps,
      rolelessProbes: probeDeps,
    });

    const sut = main;
    const result = await sut([], IO_NULL, deps);

    assert.equal(result.code, 0);
    const rolelessRecords = result.runRecord.filter((r) => r.outcome !== undefined);
    assert.ok(rolelessRecords.length === ROLELESS_IDS.length, 'all roleless records must be present');
    const workspaceRecord = rolelessRecords.find((r) => r.phaseId === 'workspace');
    assert.ok(workspaceRecord !== undefined, 'workspace roleless record must exist');
  });
});

// ── MANIFEST_PATH_DEFAULT path segments ─────────────────────────────────────

describe('main() — MANIFEST_PATH_DEFAULT path segments', () => {
  it('Given main runs, when loadManifest is called, then the path ends with .claude/workflow.md and is not inside src/', async () => {
    // Kills the `..` → `""` mutant: without `..`, path resolves to src/.claude/workflow.md
    // instead of <adapter-root>/.claude/workflow.md.
    let capturedPath;
    const deps = makeDeps({
      loadManifest: (p) => { capturedPath = p; return WALK_MANIFEST; },
    });

    await main([], IO_NULL, deps);

    assert.ok(capturedPath.endsWith('.claude/workflow.md'), `path must end with .claude/workflow.md, got: ${capturedPath}`);
    assert.ok(!capturedPath.includes('/src/.claude/'), `path must not resolve inside src/, got: ${capturedPath}`);
  });

  it('Given main runs, when assembleBlock is called, then the manifestPath ends with .claude/workflow.md and is not inside src/', async () => {
    const assembleRec = makeRecordingAssembleBlock();
    const deps = makeDeps({ assembleBlock: assembleRec.assembleBlockDouble });

    await main([], IO_NULL, deps);

    for (const call of assembleRec.calls) {
      assert.ok(call.manifestPath.endsWith('.claude/workflow.md'), `manifestPath must end with .claude/workflow.md, got: ${call.manifestPath}`);
      assert.ok(!call.manifestPath.includes('/src/.claude/'), `manifestPath must not resolve inside src/, got: ${call.manifestPath}`);
    }
  });
});

// ── SUBSTITUTIONS optional chaining ─────────────────────────────────────────

describe('resolveGateCommand() — null/undefined manifest optional chaining', () => {
  it('Given a null manifest, when resolveGateCommand resolves a <gates.phase> placeholder, then it returns empty string without throwing', () => {
    // Kills OptionalChaining mutant L23: `manifest.gates?.phase` would throw on null manifest.
    const sut = resolveGateCommand;
    const decision = { phaseId: 'implementation', gate: '<gates.phase>', codeProducing: true };

    const result = sut(decision, null);

    assert.equal(result, '');
  });

  it('Given a null manifest, when resolveGateCommand resolves a <validation gate> placeholder, then it returns empty string without throwing', () => {
    // Kills OptionalChaining mutants L24: `manifest.gates?.phase` would throw on null manifest.
    const sut = resolveGateCommand;
    const decision = { phaseId: 'validation', gate: '<validation gate>', codeProducing: false };

    const result = sut(decision, null);

    assert.equal(result, '');
  });

  it('Given a null manifest, when resolveGateCommand resolves pr.pre-pr-gate, then it returns empty string without throwing', () => {
    // Kills OptionalChaining mutant L25: `manifest.pr?.['pre-pr-gate']` would throw on null manifest.
    const sut = resolveGateCommand;
    const decision = { phaseId: 'propose', gate: 'pr.pre-pr-gate', codeProducing: false };

    const result = sut(decision, null);

    assert.equal(result, '');
  });

  it('Given a manifest with no gates key, when resolveGateCommand resolves validation gate placeholder, then it returns empty string', () => {
    const sut = resolveGateCommand;
    const decision = { phaseId: 'validation', gate: '<validation gate>', codeProducing: false };

    const result = sut(decision, {});

    assert.equal(result, '');
  });

  it('Given a manifest with no pr key, when resolveGateCommand resolves pr.pre-pr-gate, then it returns empty string', () => {
    const sut = resolveGateCommand;
    const decision = { phaseId: 'propose', gate: 'pr.pre-pr-gate', codeProducing: false };

    const result = sut(decision, {});

    assert.equal(result, '');
  });

  it('Given undefined decision, when resolveGateCommand runs, then it returns empty string without throwing', () => {
    // Kills OptionalChaining mutant L40: `decision.gate` would throw when decision is undefined.
    const sut = resolveGateCommand;

    const result = sut(undefined, WALK_MANIFEST);

    assert.equal(result, '');
  });
});

// ── spawnPi options contract ─────────────────────────────────────────────────

describe('spawnPi() — options contract', () => {
  it('Given spawnPi is called with a cwd and env, when the execFile is invoked, then options carries cwd and env', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = spawnPi;
    const env = { PATH: '/usr/bin' };
    const promise = sut(['arg'], { cwd: '/my/repo', env }, execFile);
    captured.cb(null, 'OUT', '');

    await promise;

    assert.equal(captured.options.cwd, '/my/repo');
    assert.equal(captured.options.env, env);
    assert.equal(captured.options.encoding, 'utf8');
  });

  it('Given spawnPi is called, when the execFile is invoked, then stdio is [ignore, pipe, pipe]', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = spawnPi;
    const promise = sut(['arg'], { cwd: '/tmp' }, execFile);
    captured.cb(null, 'OUT', '');

    await promise;

    assert.deepEqual(captured.options.stdio, ['ignore', 'pipe', 'pipe']);
  });
});

// ── runGate options contract ─────────────────────────────────────────────────

describe('runGate() — options contract', () => {
  it('Given runGate is called with a cwd, when the execFile is invoked, then options carries cwd and encoding utf8', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = runGate;
    const promise = sut('node --test', { cwd: '/my/repo' }, execFile);
    captured.cb(null, 'ok', '');

    await promise;

    assert.equal(captured.options.cwd, '/my/repo');
    assert.equal(captured.options.encoding, 'utf8');
  });

  it('Given a gate command with multiple consecutive spaces, when runGate runs, then only non-empty tokens become file/args', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = runGate;
    const promise = sut('node  --test', { cwd: '/tmp' }, execFile);
    captured.cb(null, 'ok', '');

    await promise;

    assert.equal(captured.file, 'node');
    assert.deepEqual(captured.args, ['--test']);
  });

  it('Given pi stderr with surrounding whitespace, when runGate rejects, then blocker detail is trimmed', async () => {
    const { execFile, captured } = makeExecFileDouble();
    const sut = runGate;
    const promise = sut('node --test', { cwd: '/tmp' }, execFile);
    captured.cb(new Error('nonzero'), '', '  test failed  ');

    await assert.rejects(promise, (err) => {
      assert.match(err.message, /test failed/);
      assert.ok(!err.message.includes('  test failed  '), 'stderr must be trimmed');
      return true;
    });
  });
});

// ── runWorkerPhase — dynamics and opts passed ────────────────────────────────

describe('main() — worker phase dynamics and opts contract', () => {
  it('Given a worker phase, when spawnPi is called, then opts.cwd matches the configured cwd', async () => {
    const spawnRec = makeRecordingSpawnPi();
    const deps = makeDeps({ spawnPi: spawnRec.spawnPiDouble, cwd: '/project/root' });

    await main([], IO_NULL, deps);

    for (const call of spawnRec.calls) {
      assert.equal(call.opts.cwd, '/project/root', 'spawnPi opts.cwd must be the configured cwd');
    }
  });

  it('Given a worker phase, when spawnPi is called, then argv prompt contains phaseId from dynamics', async () => {
    // Kills the `dynamics = {}` mutant: with empty dynamics, buildPiArgs receives no phaseId/model/gate
    // and the prompt's Phase dynamics section would be empty, missing the phase identity.
    const spawnRec = makeRecordingSpawnPi();
    const deps = makeDeps({ spawnPi: spawnRec.spawnPiDouble });

    await main([], IO_NULL, deps);

    // The first worker phase is 'design'; its phaseId must appear in the prompt (last argv element).
    const designCall = spawnRec.calls[0];
    assert.ok(designCall !== undefined, 'at least one spawnPi call must exist');
    const prompt = designCall.argv[designCall.argv.length - 1];
    assert.match(prompt, /phaseId/, 'prompt must contain phaseId from dynamics');
  });

  it('Given a worker phase, when spawnPi is called, then opts.env matches the configured env', async () => {
    const spawnRec = makeRecordingSpawnPi();
    const env = { MY_VAR: 'value' };
    const deps = makeDeps({ spawnPi: spawnRec.spawnPiDouble, env });

    await main([], IO_NULL, deps);

    for (const call of spawnRec.calls) {
      assert.equal(call.opts.env, env, 'spawnPi opts.env must be the configured env');
    }
  });

  it('Given a code-producing worker phase with a resolved gate, when main runs, then runGate opts.cwd matches the configured cwd', async () => {
    const gateRec = makeRecordingRunGate();
    const deps = makeDeps({ runGate: gateRec.runGateDouble, cwd: '/project/root' });

    await main([], IO_NULL, deps);

    const codeCalls = gateRec.calls.filter((c) => c.command === 'node --test');
    assert.ok(codeCalls.length > 0, 'runGate must be called for code-producing phases');
    for (const call of codeCalls) {
      assert.equal(call.opts.cwd, '/project/root', 'runGate opts.cwd must be the configured cwd');
    }
  });

  it('Given a worker phase has no gateDecision entry, when main runs, then it does not throw (decision?.codeProducing safe access)', async () => {
    // Kills the OptionalChaining mutant `decision?.codeProducing` → `decision.codeProducing`:
    // when gateDecisions does not include an entry for a worker phase, `decision` is undefined,
    // and `decision.codeProducing` would throw TypeError while `decision?.codeProducing` returns undefined.
    const spawnRec = makeRecordingSpawnPi();
    // Remove the 'design' entry from gateDecisions so design phase has no decision
    const gateDecisionsWithoutDesign = CANNED_GATE_DECISIONS.filter((d) => d.phaseId !== 'design');
    const deps = makeDeps({
      spawnPi: spawnRec.spawnPiDouble,
      resolvePipeline: async () => ({ ...CANNED_RESOLUTION, gateDecisions: gateDecisionsWithoutDesign }),
    });

    const result = await main([], IO_NULL, deps);

    assert.equal(result.code, 0, 'main must not throw when a worker phase has no gateDecision');
  });
});

// ── floor violation error message ────────────────────────────────────────────

describe('main() — floor violation error message', () => {
  it('Given code-producing phase with no gate in manifest, when main runs, then stderr contains unit: gate and gates.phase', async () => {
    const emptyManifest = Object.freeze({});
    const { io, output } = makeIo();
    const deps = makeDeps({ loadManifest: () => emptyManifest });

    const result = await main([], io, deps);

    assert.equal(result.code, 2);
    const msg = output.stderr.join('');
    assert.match(msg, /unit: gate/);
    assert.match(msg, /gates\.phase/);
  });
});

// ── buildRolelessDepBag — propose branch ────────────────────────────────────

describe('main() — buildRolelessDepBag propose vs non-propose', () => {
  it('Given propose is reached with a non-empty validationGateCmd, when main runs, then runGate is called before propose with the validation command', async () => {
    const { steps: rolelessSteps } = makeRecordingRolelessSteps();
    const validationGateDecisions = CANNED_GATE_DECISIONS.map((d) =>
      d.phaseId === 'validation' ? { ...d, gate: 'node-validation-gate' } : d,
    );
    const gateRec = makeRecordingRunGate();
    const deps = makeDeps({
      rolelessSteps,
      resolvePipeline: async () => ({ ...CANNED_RESOLUTION, gateDecisions: validationGateDecisions }),
      runGate: gateRec.runGateDouble,
    });

    const result = await main([], IO_NULL, deps);

    assert.equal(result.code, 0);
    const validationGateCalls = gateRec.calls.filter((c) => c.command === 'node-validation-gate');
    assert.equal(validationGateCalls.length, 1, 'validation gate must be called exactly once before propose');
    assert.equal(validationGateCalls[0].opts.cwd, '/fake/cwd', 'runGate opts.cwd must be the configured cwd');
  });

  it('Given integrate is reached (non-propose roleless), when main runs, then runGate is NOT called for integrate even when validationGateCmd is set', async () => {
    const { steps: rolelessSteps } = makeRecordingRolelessSteps();
    const validationGateDecisions = CANNED_GATE_DECISIONS.map((d) =>
      d.phaseId === 'validation' ? { ...d, gate: 'node-validation-gate' } : d,
    );
    const gateRec = makeRecordingRunGate();
    const deps = makeDeps({
      rolelessSteps,
      resolvePipeline: async () => ({ ...CANNED_RESOLUTION, gateDecisions: validationGateDecisions }),
      runGate: gateRec.runGateDouble,
    });

    const result = await main([], IO_NULL, deps);

    assert.equal(result.code, 0);
    const integrateCalls = gateRec.calls.filter((c) => c.command === 'node-validation-gate');
    // Only ONE call (before propose), integrate must not trigger another
    assert.equal(integrateCalls.length, 1, 'validation gate must only fire before propose, not again for integrate');
  });
});

// ── roleless step blocker reason fallback ────────────────────────────────────

describe('main() — roleless blocker reason fallback', () => {
  it('Given a roleless step returns blocker without reason field, when main runs, then stderr contains step blocked fallback', async () => {
    const { steps: rolelessSteps } = makeRecordingRolelessSteps();
    rolelessSteps.workspace = async () => ({
      ok: false,
      record: '',
      blocker: { unit: 'workspace' },
    });
    const { io, output } = makeIo();
    const deps = makeDeps({ rolelessSteps });

    await main([], io, deps);

    const msg = output.stderr.join('');
    assert.match(msg, /step blocked/);
  });

  it('Given a roleless step returns blocker WITH a reason field, when main runs, then stderr contains that specific reason text (not the fallback)', async () => {
    // Kills the `??` → `&&` mutant: with `&&`, a truthy reason is replaced by 'step blocked'.
    // With `??`, a defined reason is used as-is, so the specific text must appear in stderr.
    const { steps: rolelessSteps } = makeRecordingRolelessSteps();
    rolelessSteps.workspace = async () => ({
      ok: false,
      record: '',
      blocker: { unit: 'workspace', reason: 'custom-reason-xyz' },
    });
    const { io, output } = makeIo();
    const deps = makeDeps({ rolelessSteps });

    await main([], io, deps);

    const msg = output.stderr.join('');
    assert.match(msg, /custom-reason-xyz/);
  });

  it('Given a roleless step returns ok:false with blocker undefined, when main runs, then stderr contains step blocked fallback (optional chaining on blocker)', async () => {
    // Kills the OptionalChaining mutant `stepResult.blocker?.reason` → `stepResult.blocker.reason`:
    // when blocker is undefined, `blocker.reason` throws TypeError while `blocker?.reason` returns
    // undefined, allowing the ?? fallback to 'step blocked' to fire safely.
    const { steps: rolelessSteps } = makeRecordingRolelessSteps();
    rolelessSteps.workspace = async () => ({
      ok: false,
      record: '',
      blocker: undefined,
    });
    const { io, output } = makeIo();
    const deps = makeDeps({ rolelessSteps });

    const result = await main([], io, deps);

    assert.equal(result.code, 2);
    const msg = output.stderr.join('');
    assert.match(msg, /step blocked/);
  });
});

// ── cwd and env default wiring ───────────────────────────────────────────────

describe('wireDefaults() — cwd and env wiring', () => {
  it('Given deps.cwd is provided, when main runs, then spawnPi opts.cwd reflects the provided value', async () => {
    const spawnRec = makeRecordingSpawnPi();
    const deps = makeDeps({ spawnPi: spawnRec.spawnPiDouble, cwd: '/provided/cwd' });

    await main([], IO_NULL, deps);

    assert.ok(spawnRec.calls.every((c) => c.opts.cwd === '/provided/cwd'), 'all spawnPi calls must use the provided cwd');
  });

  it('Given deps.env is provided, when main runs, then spawnPi opts.env reflects the provided value', async () => {
    const spawnRec = makeRecordingSpawnPi();
    const env = { CRAFT: '1' };
    const deps = makeDeps({ spawnPi: spawnRec.spawnPiDouble, env });

    await main([], IO_NULL, deps);

    assert.ok(spawnRec.calls.every((c) => c.opts.env === env), 'all spawnPi calls must use the provided env');
  });
});

// ── runRecord initial state and resolution failure ───────────────────────────

describe('main() — runRecord and resolution failure', () => {
  it('Given resolution.ok is false, when main runs, then runRecord in the returned value is empty', async () => {
    const deps = makeDeps({
      resolvePipeline: async () => ({ ok: false, effective: [], gateDecisions: [], errors: ['broken'], waivers: [] }),
    });

    const result = await main([], IO_NULL, deps);

    assert.equal(result.code, 2);
    assert.deepEqual(result.runRecord, []);
  });

  it('Given resolution succeeds with zero phases, when main runs, then runRecord is exactly [] (initial value — kills runRecord init mutant)', async () => {
    // Kills `const runRecord = ["Stryker was here"]` mutant: with zero phases the loop never
    // pushes, so the returned runRecord is the initial value. Exact deepEqual catches the mutation.
    const deps = makeDeps({
      resolvePipeline: async () => ({ ok: true, effective: [], gateDecisions: [], errors: [], waivers: [] }),
    });

    const result = await main([], IO_NULL, deps);

    assert.equal(result.code, 0);
    assert.deepEqual(result.runRecord, []);
  });
});

// ── codeProducing gate must NOT fire for non-code-producing worker phases ────

describe('main() — codeProducing gate discipline', () => {
  it('Given a non-code-producing worker phase (review), when main runs, then runGate is NOT called for review', async () => {
    const gateRec = makeRecordingRunGate();
    // Build resolution where only review is in the pipeline
    const minimalEffective = [
      { id: 'workspace', archetype: 'setup', role: undefined, model: undefined, gate: '' },
      { id: 'review', archetype: 'harness', role: 'craft:reviewer', model: 'opus', gate: '<gates.phase>' },
      { id: 'decisions', archetype: 'specification', role: undefined, model: undefined, gate: '' },
      { id: 'integrate', archetype: 'delivery', role: undefined, model: undefined, gate: '' },
    ];
    const minimalDecisions = [
      { phaseId: 'workspace', gate: '', codeProducing: false },
      { phaseId: 'review', gate: '<gates.phase>', codeProducing: false },
      { phaseId: 'decisions', gate: '', codeProducing: false },
      { phaseId: 'integrate', gate: '', codeProducing: false },
    ];
    const deps = makeDeps({
      runGate: gateRec.runGateDouble,
      resolvePipeline: async () => ({ ...CANNED_RESOLUTION, effective: minimalEffective, gateDecisions: minimalDecisions }),
    });

    const result = await main([], IO_NULL, deps);

    assert.equal(result.code, 0);
    const reviewGateCalls = gateRec.calls.filter((c) => c.command === 'node --test');
    assert.equal(reviewGateCalls.length, 0, 'runGate must NOT be called for non-code-producing phases');
  });
});

// ── wireDefaults env fallback ────────────────────────────────────────────────

describe('wireDefaults() — env fallback to process.env when not injected', () => {
  it('Given deps.env is not provided, when main runs, then spawnPi opts.env is a non-null object (process.env fallback)', async () => {
    const spawnRec = makeRecordingSpawnPi();
    // Deliberately NOT including env in the deps so wireDefaults falls back to process.env.
    // This distinguishes `deps.env ?? process.env` from `deps.env && process.env`:
    // with `&&`, an omitted env yields undefined; with `??`, it yields process.env.
    const deps = {
      resolvePipeline: async () => CANNED_RESOLUTION,
      assembleBlock: makeRecordingAssembleBlock().assembleBlockDouble,
      spawnPi: spawnRec.spawnPiDouble,
      runGate: makeRecordingRunGate().runGateDouble,
      loadManifest: () => WALK_MANIFEST,
      rolelessSteps: makeRecordingRolelessSteps().steps,
      cwd: '/fake/cwd',
      // env intentionally omitted
    };

    await main([], IO_NULL, deps);

    assert.ok(spawnRec.calls.length > 0, 'spawnPi must be called');
    assert.ok(spawnRec.calls.every((c) => c.opts.env !== undefined), 'spawnPi opts.env must be process.env (not undefined) when env not injected');
  });
});
