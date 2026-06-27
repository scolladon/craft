/**
 * Unit tests for emitManifest and joinManifest — pure manifest emitter.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitManifest, joinManifest } from '../src/init-emit.js';
import { validateManifest } from '../src/manifest.js';
import { parseManifestContent } from '../src/frontmatter.js';

const TOP_KEYS = new Set([
  'backlog', 'memory', 'paths', 'context', 'gates', 'phases',
  'pr', 'scripts', 'models', 'pipeline', 'retrieval', 'execution',
  'extends', 'policy',
]);

// ─── Unit tests (cases 1–22) ──────────────────────────────────────────────────

test('Given answers name only, when emitManifest runs, then frontmatter is empty object and prose is non-empty string', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci' });

  assert.equal(typeof result.frontmatter, 'object');
  assert.equal(typeof result.prose, 'string');
  assert.ok(result.prose.length > 0);
});

test('Given answers with skip array, when emitManifest runs, then frontmatter.pipeline.skip is that array', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', skip: ['decisions', 'review'] });

  assert.deepEqual(result.frontmatter.pipeline.skip, ['decisions', 'review']);
});

test('Given answers with model agent, when emitManifest runs, then frontmatter.models has that agent key', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', models: { planner: 'sonnet', fallback: 'haiku' } });

  assert.equal(result.frontmatter.models.planner, 'sonnet');
  assert.equal(result.frontmatter.models.fallback, 'haiku');
});

test('Given answers with gate part command, when emitManifest runs, then frontmatter.gates.part is the command string', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', gate: { part: 'npm test' } });

  assert.equal(result.frontmatter.gates.part, 'npm test');
});

test('Given answers with gate phase command, when emitManifest runs, then frontmatter.gates.phase is the command string', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', gate: { phase: 'bash scripts/ci.sh' } });

  assert.equal(result.frontmatter.gates.phase, 'bash scripts/ci.sh');
});

test('Given answers execution per phase, when emitManifest runs, then frontmatter.phases.<id>.execution is inline or agent', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', execution: { implementation: 'agent', review: 'inline' } });

  assert.equal(result.frontmatter.phases.implementation.execution, 'agent');
  assert.equal(result.frontmatter.phases.review.execution, 'inline');
});

test('Given answers profile, when emitManifest runs, then frontmatter.pipeline.profile is the name', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', profile: 'lean' });

  assert.equal(result.frontmatter.pipeline.profile, 'lean');
});

test('Given answers harness knob, when emitManifest runs, then frontmatter.phases.<phase>.harness is an object', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', harness: { implementation: { convergence: 'low-only' } } });

  assert.deepEqual(result.frontmatter.phases.implementation.harness, { convergence: 'low-only' });
});

test('Given answers backlog, when emitManifest runs, then frontmatter.backlog is { source, ref }', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', backlog: { source: 'file', ref: '.claude/BACKLOG.md' } });

  assert.deepEqual(result.frontmatter.backlog, { source: 'file', ref: '.claude/BACKLOG.md' });
});

test('Given answers memory, when emitManifest runs, then frontmatter.memory is { source, ref }', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', memory: { source: 'custom', ref: 'my-memory' } });

  assert.deepEqual(result.frontmatter.memory, { source: 'custom', ref: 'my-memory' });
});

test('Given answers policy, when emitManifest runs, then frontmatter.policy groups actions under verdicts and no action is in two verdicts', () => {
  const sut = emitManifest;
  const policy = { always: ['isolate', 'commit'], ask: ['push', 'propose'], never: ['integrate'] };

  const result = sut({ name: 'ci', policy });

  assert.deepEqual(result.frontmatter.policy.always, ['isolate', 'commit']);
  assert.deepEqual(result.frontmatter.policy.ask, ['push', 'propose']);
  assert.deepEqual(result.frontmatter.policy.never, ['integrate']);

  const allActions = [
    ...(result.frontmatter.policy.always ?? []),
    ...(result.frontmatter.policy.ask ?? []),
    ...(result.frontmatter.policy.never ?? []),
  ];
  const unique = new Set(allActions);
  assert.equal(allActions.length, unique.size, 'no action should appear in two verdicts');
});

test('Given answers global context path, when emitManifest runs, then frontmatter.context is the path', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', context: 'docs/context.md' });

  assert.equal(result.frontmatter.context, 'docs/context.md');
});

test('Given answers per-phase context, when emitManifest runs, then frontmatter.phases.<id>.context is the path', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', phaseContext: { implementation: 'docs/impl-context.md' } });

  assert.equal(result.frontmatter.phases.implementation.context, 'docs/impl-context.md');
});

test('Given answers override, when emitManifest runs, then frontmatter.phases.<id>.override is the path', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', override: { design: 'docs/design-override.md' } });

  assert.equal(result.frontmatter.phases.design.override, 'docs/design-override.md');
});

test('Given answers role and procedure swap, when emitManifest runs, then phases.<id>.role and .procedure are set', () => {
  const sut = emitManifest;

  const result = sut({
    name: 'ci',
    role: { implementation: 'agents/impl.md' },
    procedure: { review: 'docs/review-proc.md' },
  });

  assert.equal(result.frontmatter.phases.implementation.role, 'agents/impl.md');
  assert.equal(result.frontmatter.phases.review.procedure, 'docs/review-proc.md');
});

test('Given answers insert, when emitManifest runs, then frontmatter.pipeline.insert is an array', () => {
  const sut = emitManifest;
  const insert = [{ after: 'implementation', phase: 'custom-phase' }];

  const result = sut({ name: 'ci', insert });

  assert.deepEqual(result.frontmatter.pipeline.insert, insert);
});

test('Given answers DoD artifact, when emitManifest runs, then frontmatter.paths.dod is the path', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', dod: 'docs/DOD.md' });

  assert.equal(result.frontmatter.paths.dod, 'docs/DOD.md');
});

test('Given any answers, when emitManifest runs, then every top-level frontmatter key is in TOP_KEYS', () => {
  const sut = emitManifest;
  const answers = {
    name: 'ci',
    skip: ['decisions'],
    models: { fallback: 'haiku' },
    gate: { part: 'npm test', phase: 'bash ci.sh' },
    execution: { implementation: 'agent' },
    profile: 'lean',
    harness: { review: { convergence: 'none' } },
    backlog: { source: 'file', ref: '.claude/BACKLOG.md' },
    memory: { source: 'custom', ref: 'mem' },
    policy: { always: ['isolate'] },
    context: 'docs/ctx.md',
    phaseContext: { design: 'docs/design-ctx.md' },
    override: { planning: 'docs/plan-override.md' },
    role: { implementation: 'agents/impl.md' },
    procedure: { review: 'docs/review-proc.md' },
    insert: [{ after: 'design', phase: 'extra' }],
    dod: 'docs/DOD.md',
  };

  const result = sut(answers);

  for (const key of Object.keys(result.frontmatter)) {
    assert.ok(TOP_KEYS.has(key), `unexpected top-level key: ${key}`);
  }
});

test('Given any answers, when emitManifest runs, then no per-phase skip key is ever emitted', () => {
  const sut = emitManifest;
  const answers = {
    name: 'ci',
    skip: ['decisions'],
    execution: { implementation: 'agent', review: 'inline' },
    phaseContext: { design: 'docs/design-ctx.md' },
  };

  const result = sut(answers);

  const phases = result.frontmatter.phases ?? {};
  for (const [phaseId, phaseObj] of Object.entries(phases)) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(phaseObj, 'skip'),
      false,
      `phase ${phaseId} must not have a skip key`,
    );
  }
});

test('Given any answers, when joined output is built, then it contains no provenance token', () => {
  const sut = joinManifest;
  const { frontmatter, prose } = emitManifest({ name: 'ci', profile: 'lean' });

  const result = sut({ frontmatter, prose });

  assert.doesNotMatch(result, /\b(P25|ADR-?\d+|backlog)\b/i);
});

test('Given answers with no configurable points, when emitManifest runs, then frontmatter has no unexpected keys', () => {
  const sut = emitManifest;

  const result = sut({ name: 'minimal' });

  const keys = Object.keys(result.frontmatter);
  assert.equal(keys.length, 0, `expected empty frontmatter, got keys: ${keys.join(', ')}`);
});

test('Given answers with only a name, when joinManifest runs, then joined string has yaml fence shape ---\\n<yaml>---\\n\\n<prose>\\n', () => {
  const sut = joinManifest;
  const { frontmatter, prose } = emitManifest({ name: 'ci' });

  const result = sut({ frontmatter, prose });

  assert.ok(result.startsWith('---\n'), 'must start with opening fence');
  assert.ok(result.includes('\n---\n\n'), 'must have closing fence then blank line');
  assert.ok(result.endsWith('\n'), 'must end with newline');
});

test('Given emitManifest result, when answers is checked, then original answers object is not mutated', () => {
  const sut = emitManifest;
  const answers = { name: 'ci', skip: ['decisions'], models: { fallback: 'haiku' } };
  const originalSkip = [...answers.skip];
  const originalModels = { ...answers.models };

  sut(answers);

  assert.deepEqual(answers.skip, originalSkip);
  assert.deepEqual(answers.models, originalModels);
});

// ─── Round-trip property cases (cases 23–28) ─────────────────────────────────

const ALWAYS_EXISTS = () => true;

function roundTrip(answers) {
  const { frontmatter, prose } = emitManifest(answers);
  const joined = joinManifest({ frontmatter, prose });
  const parsed = parseManifestContent(joined);
  return validateManifest(parsed, { fileExists: ALWAYS_EXISTS });
}

test('Given Tier-0 point set answers together, when emit→join→parse→validate runs, then ok:true', () => {
  const answers = {
    name: 'tier0',
    skip: ['decisions'],
    models: { fallback: 'haiku', planner: 'sonnet' },
    gate: { part: 'npm test' },
    profile: 'lean',
  };

  const result = roundTrip(answers);

  assert.equal(result.ok, true, `errors: ${result.errors.join(', ')}`);
});

test('Given Tier-1 point set answers together, when emit→join→parse→validate runs, then ok:true', () => {
  const answers = {
    name: 'tier1',
    context: 'docs/ctx.md',
    phaseContext: { design: 'docs/design-ctx.md' },
    override: { planning: 'docs/plan-override.md' },
    dod: 'docs/DOD.md',
  };

  const result = roundTrip(answers);

  assert.equal(result.ok, true, `errors: ${result.errors.join(', ')}`);
});

test('Given models agent with fallback answers, when emit→join→parse→validate runs, then ok:true', () => {
  const answers = {
    name: 'models-with-fallback',
    models: {
      fallback: 'haiku',
      planner: 'sonnet',
      'part-implementer': 'sonnet',
      reviewer: 'opus',
    },
  };

  const result = roundTrip(answers);

  assert.equal(result.ok, true, `errors: ${result.errors.join(', ')}`);
});

test('Given models agent without fallback answers, when emit→join→parse→validate runs, then ok:true', () => {
  const answers = {
    name: 'models-no-fallback',
    models: {
      planner: 'sonnet',
      designer: 'haiku',
    },
  };

  const result = roundTrip(answers);

  assert.equal(result.ok, true, `errors: ${result.errors.join(', ')}`);
});

test('Given defaults-only answers, when emit→join→parse→validate runs, then ok:true', () => {
  const answers = { name: 'defaults-only' };

  const result = roundTrip(answers);

  assert.equal(result.ok, true, `errors: ${result.errors.join(', ')}`);
});

test('Given maximal all-points answers, when emit→join→parse→validate runs, then ok:true', () => {
  const answers = {
    name: 'maximal',
    skip: ['decisions'],
    models: {
      fallback: 'haiku',
      planner: 'sonnet',
      designer: 'sonnet',
      reviewer: 'opus',
      'part-implementer': 'sonnet',
      'refactor-executor': 'haiku',
      'harness-triager': 'haiku',
      'docs-writer': 'haiku',
      'backlog-ticker': 'haiku',
    },
    gate: { part: 'npm test', phase: 'bash ci.sh' },
    execution: { implementation: 'agent', review: 'inline' },
    profile: 'lean',
    harness: { implementation: { convergence: 'low-only' } },
    backlog: { source: 'custom', ref: 'my-backlog' },
    memory: { source: 'custom', ref: 'my-memory' },
    policy: { always: ['isolate', 'commit'], ask: ['push'], never: ['integrate'] },
    context: 'docs/ctx.md',
    phaseContext: { design: 'docs/design-ctx.md' },
    override: { planning: 'docs/plan-override.md' },
    role: { implementation: 'agents/impl.md' },
    procedure: { review: 'docs/review-proc.md' },
    dod: 'docs/DOD.md',
  };

  const result = roundTrip(answers);

  assert.equal(result.ok, true, `errors: ${result.errors.join(', ')}`);
});

test('Given answers with a pipeline insert, when emit→join→parse→validate runs, then ok:true', () => {
  const answers = {
    name: 'with-insert',
    insert: [
      { after: 'implementation', phase: { id: 'license-scan', procedure: 'my:license-check', execution: 'inline' } },
    ],
  };

  const result = roundTrip(answers);

  assert.equal(result.ok, true, `errors: ${result.errors.join(', ')}`);
});

test('Given answers with a policy action in two verdicts, when emit→join→parse→validate runs, then ok:false (emit forwards invalid intent to the lint guard)', () => {
  const answers = { name: 'conflict', policy: { always: ['push'], never: ['push'] } };

  const result = roundTrip(answers);

  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0, 'a conflicting policy must surface a validation error');
});

test('Given answers with an unknown field, when emitManifest runs, then the unknown field is dropped and the manifest stays valid', () => {
  const sut = emitManifest;

  const result = sut({ name: 'x', unknownField: 'value', profile: 'lean' });

  assert.equal('unknownField' in result.frontmatter, false, 'unknown answer fields are never emitted');
  const validated = validateManifest(parseManifestContent(joinManifest(result)), { fileExists: () => true });
  assert.equal(validated.ok, true, `errors: ${validated.errors.join(', ')}`);
});

// ─── Mutation-kill cases ───────────────────────────────────────────────────────

test('Given answers with skip empty array, when emitManifest runs, then pipeline.skip is absent from frontmatter', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', skip: [] });

  assert.equal('pipeline' in result.frontmatter, false, 'empty skip must not produce a pipeline key');
});

test('Given answers with insert empty array, when emitManifest runs, then pipeline.insert is absent from frontmatter', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', insert: [] });

  assert.equal('pipeline' in result.frontmatter, false, 'empty insert must not produce a pipeline key');
});

test('Given answers with models empty object, when emitManifest runs, then models key is absent from frontmatter', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', models: {} });

  assert.equal('models' in result.frontmatter, false, 'empty models must not produce a models key');
});

test('Given answers with gate that has only part, when emitManifest runs, then gates.part is set and gates.phase is absent', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', gate: { part: 'npm test' } });

  assert.equal(result.frontmatter.gates.part, 'npm test');
  assert.equal('phase' in result.frontmatter.gates, false, 'gates.phase must be absent when not provided');
});

test('Given answers with gate that has only phase, when emitManifest runs, then gates.phase is set and gates.part is absent', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', gate: { phase: 'bash ci.sh' } });

  assert.equal(result.frontmatter.gates.phase, 'bash ci.sh');
  assert.equal('part' in result.frontmatter.gates, false, 'gates.part must be absent when not provided');
});

test('Given answers with empty gate object, when emitManifest runs, then gates key is absent from frontmatter', () => {
  const sut = emitManifest;

  const result = sut({ name: 'ci', gate: {} });

  assert.equal('gates' in result.frontmatter, false, 'empty gate must not produce a gates key');
});

test('Given phaseContext as a non-object string, when emitManifest runs, then phases key is absent from frontmatter', () => {
  // mergePhaseField guard at L49: !source || typeof source !== 'object' must short-circuit for non-object.
  const sut = emitManifest;

  const result = sut({ name: 'ci', phaseContext: 'not-an-object' });

  assert.equal('phases' in result.frontmatter, false, 'non-object phaseContext must be silently dropped');
});

test('Given two phase-keyed fields sharing a phase id, when emitManifest runs, then both fields merge into one phases[id] entry', () => {
  // L51 guard: if (!phases[id]) phases[id] = {} — initialises only once; second field must reuse the entry.
  const sut = emitManifest;

  const result = sut({
    name: 'ci',
    execution: { implementation: 'agent' },
    harness: { implementation: { convergence: 'low-only' } },
  });

  const impl = result.frontmatter.phases.implementation;
  assert.equal(impl.execution, 'agent', 'execution field must be present');
  assert.deepEqual(impl.harness, { convergence: 'low-only' }, 'harness field must be present in the same entry');
});

test('Given answers with an object-valued harness field, when emitManifest runs, then mutating the returned harness does not affect original answers', () => {
  // L54 structuredClone ternary: the emitted object must not alias the caller's nested value.
  const sut = emitManifest;
  const answers = { name: 'ci', harness: { implementation: { convergence: 'low-only' } } };

  const { frontmatter } = sut(answers);
  frontmatter.phases.implementation.harness.convergence = 'MUTATED';

  assert.equal(answers.harness.implementation.convergence, 'low-only', 'mutating emitted harness must not alias original answers');
});

test('Given flat-shape insert answers, when emit→join→parse runs, then pipeline.insert[0] is flat (no phase wrapper, no archetype)', () => {
  const sut = emitManifest;
  const insert = [{ after: 'validation', id: 'smoke', procedure: 'echo smoke', gate: 'echo ok' }];

  const { frontmatter, prose } = sut({ name: 'ci', insert });
  const joined = joinManifest({ frontmatter, prose });
  const parsed = parseManifestContent(joined);

  const entry = parsed.pipeline?.insert?.[0];
  assert.ok(entry, 'pipeline.insert[0] must exist');
  assert.equal(entry.after, 'validation', 'after must be top-level sibling');
  assert.equal(entry.id, 'smoke', 'id must be top-level sibling');
  assert.equal(entry.procedure, 'echo smoke', 'procedure must be top-level sibling');
  assert.equal(entry.gate, 'echo ok', 'gate must be top-level sibling');
  assert.equal('phase' in entry, false, 'no nested phase wrapper must exist');
  assert.equal('archetype' in entry, false, 'no archetype key must exist');
});
