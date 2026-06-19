import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { load } from 'js-yaml';
import { parsePipeline } from '../src/descriptor.js';
import { resolvePipeline } from '../src/resolve.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const defaultYml = join(__dir, '..', '..', 'pipeline', 'default.yml');
const manifestsDir = join(__dir, 'fixtures', 'manifests');

function loadDefault() {
  return parsePipeline(readFileSync(defaultYml, 'utf8'));
}

function loadManifest(name) {
  const text = readFileSync(join(manifestsDir, name), 'utf8');
  return load(text) ?? {};
}

// SC1 golden — the 11 enabled phases in today's canonical order
const SC1_IDS = [
  'workspace',
  'design',
  'decisions',
  'planning',
  'implementation',
  'review',
  'refactoring',
  'validation',
  'documentation',
  'propose',
  'integrate',
];

// Expected roles for the SC1 golden
const SC1_ROLES = {
  workspace:      undefined,
  design:         'craft:designer',
  decisions:      undefined,
  planning:       'craft:planner',
  implementation: 'craft:slice-implementer',
  review:         'craft:reviewer',
  refactoring:    'craft:refactor-executor',
  validation:     'craft:validation-triager',
  documentation:  'craft:docs-writer',
  propose:        undefined,
  integrate:      undefined,
};

// ─── zero-config (SC1 golden) ────────────────────────────────────────────────

test('Given no manifest (null), when resolvePipeline is called, then effective matches the 11 enabled phases in order', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS);
});

test('Given no manifest (null), when resolvePipeline is called, then effective roles match today\'s defaults', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  for (const d of result.effective) {
    assert.equal(
      d.role,
      SC1_ROLES[d.id],
      `Phase "${d.id}" expected role "${SC1_ROLES[d.id]}", got "${d.role}"`,
    );
  }
});

test('Given no manifest (null), when resolvePipeline is called, then record is an array', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.ok(Array.isArray(result.record));
});

test('Given no manifest (undefined), when resolvePipeline is called, then effective matches the 11 enabled phases', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, undefined);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS);
});

test('Given no manifest (null), when resolvePipeline is called, then all 11 enabled phases have execution:agent', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  assert.equal(result.effective.length, SC1_IDS.length, 'Expected exactly 11 enabled phases');
  for (const d of result.effective) {
    assert.equal(
      d.execution,
      'agent',
      `Phase "${d.id}" expected execution "agent", got "${d.execution}"`,
    );
  }
});

// ─── skip-decisions (allowed — its only consumer, planning, self-supplies it) ─

test('Given manifest skip-decisions, when resolvePipeline is called, then ok is true and decisions is absent from effective', () => {
  const sut = loadDefault();
  const manifest = loadManifest('skip-decisions.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);
  assert.ok(!result.effective.some(d => d.id === 'decisions'), 'decisions should be absent');
});

// ─── skip-design (refused — strands documentation which consumes design without self_supply) ─

test('Given manifest skip-design, when resolvePipeline is called, then ok is false with a strand error naming documentation and design', () => {
  const sut = loadDefault();
  const manifest = loadManifest('skip-design.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /documentation/i.test(e) && /strand/i.test(e) ||
                            /design/i.test(e) && /strand/i.test(e)),
    `Expected a strand error naming documentation or design, got: ${result.errors.join('; ')}`,
  );
});

// ─── skip-planning (refused — strands implementation) ────────────────────────

test('Given manifest skip-planning, when resolvePipeline is called, then ok is false with a strand error naming planning and strand', () => {
  const sut = loadDefault();
  const manifest = loadManifest('skip-planning.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /planning/i.test(e) && /strand/i.test(e)),
    `Expected a strand error containing both "planning" and "strand", got: ${result.errors.join('; ')}`,
  );
});

// ─── skip-workspace (refused — strands implementation) ───────────────────────

test('Given manifest skip-workspace, when resolvePipeline is called, then ok is false with a strand error naming workspace and strand', () => {
  const sut = loadDefault();
  const manifest = loadManifest('skip-workspace.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /workspace/i.test(e) && /strand/i.test(e)),
    `Expected a strand error containing both "workspace" and "strand", got: ${result.errors.join('; ')}`,
  );
});

// ─── profile-solo (harness phases stay agent) ────────────────────────────────

test('Given manifest profile-solo, when resolvePipeline is called, then non-harness phases get execution:inline', () => {
  const sut = loadDefault();
  const manifest = loadManifest('profile-solo.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);

  const nonHarnessPhases = result.effective.filter(d => d.archetype !== 'harness');
  assert.ok(nonHarnessPhases.length > 0, 'Expected at least one non-harness phase');

  for (const d of nonHarnessPhases) {
    assert.equal(
      d.execution,
      'inline',
      `Non-harness phase "${d.id}" should have execution:inline under solo profile`,
    );
  }
});

test('Given manifest profile-solo, when resolvePipeline is called, then harness-archetype phases stay execution:agent', () => {
  const sut = loadDefault();
  const manifest = loadManifest('profile-solo.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);

  const harnessPhases = result.effective.filter(d => d.archetype === 'harness');
  assert.ok(harnessPhases.length > 0, 'Expected at least one harness phase');

  for (const d of harnessPhases) {
    assert.equal(
      d.execution,
      'agent',
      `Harness phase "${d.id}" must stay execution:agent under solo profile`,
    );
  }
});

// ─── security: whitelist phase-override fields ───────────────────────────────

test('Given a manifest with phases.validation.archetype:setup and profile:solo, when resolvePipeline is called, then validation execution stays agent (archetype not overridable)', () => {
  const sut = loadDefault();
  const manifest = {
    pipeline: { profile: 'solo' },
    phases: { validation: { archetype: 'setup' } },
  };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.ok(validation, 'validation phase should be present');
  assert.equal(
    validation.execution,
    'agent',
    'validation must stay agent — harness archetype cannot be overridden by manifest',
  );
});

test('Given a manifest with phases.workspace.id:renamed, when resolvePipeline is called, then workspace id is not renamed', () => {
  const sut = loadDefault();
  const manifest = {
    phases: { workspace: { id: 'renamed' } },
  };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const workspace = result.effective.find(d => d.id === 'workspace');
  assert.ok(workspace, 'workspace should still be present under its original id');
  assert.ok(!result.effective.some(d => d.id === 'renamed'), 'renamed should not appear');
});

// ─── security: validate execution values ─────────────────────────────────────

test('Given a manifest with phases.implementation.execution:turbo (invalid), when resolvePipeline is called, then ok is false naming the bad value', () => {
  const sut = loadDefault();
  const manifest = {
    phases: { implementation: { execution: 'turbo' } },
  };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /turbo/i.test(e)),
    `Expected error naming "turbo", got: ${result.errors.join('; ')}`,
  );
});

test('Given a manifest with top-level execution:turbo (invalid), when resolvePipeline is called, then ok is false naming the bad value', () => {
  const sut = loadDefault();
  const manifest = { execution: 'turbo' };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /turbo/i.test(e)),
    `Expected error naming "turbo", got: ${result.errors.join('; ')}`,
  );
});

test('Given a manifest with pipeline.insert containing execution:warp (invalid), when resolvePipeline is called, then ok is false naming the bad value', () => {
  const sut = loadDefault();
  const manifest = {
    pipeline: {
      insert: [{
        id: 'bench',
        archetype: 'harness',
        contract: [],
        procedure: 'craft:bench',
        after: 'validation',
        execution: 'warp',
      }],
    },
  };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /warp/i.test(e)),
    `Expected error naming "warp", got: ${result.errors.join('; ')}`,
  );
});

// ─── security: unknown profile → structured error, not throw ─────────────────

test('Given a manifest with pipeline.profile:typo (unknown), when resolvePipeline is called, then ok is false naming the unknown profile', () => {
  const sut = loadDefault();
  const manifest = { pipeline: { profile: 'typo' } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /typo/i.test(e)),
    `Expected error naming "typo", got: ${result.errors.join('; ')}`,
  );
});

test('Given a manifest with pipeline.profile:constructor (prototype key, no registered constructor), when resolvePipeline is called, then ok is false (unknown profile)', () => {
  const sut = loadDefault();
  const manifest = { pipeline: { profile: 'constructor' } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /unknown profile/i.test(e) || /constructor/i.test(e)),
    `Expected error for unknown profile "constructor", got: ${result.errors.join('; ')}`,
  );
});

// ─── exec-precedence: isolates execution precedence legs ─────────────────────

test('Given exec-precedence manifest, when resolvePipeline is called, then documentation=inline (profile beat top-level agent)', () => {
  const sut = loadDefault();
  const manifest = loadManifest('exec-precedence.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const documentation = result.effective.find(d => d.id === 'documentation');
  assert.ok(documentation, 'documentation phase should be present');
  assert.equal(
    documentation.execution,
    'inline',
    'documentation should be inline: profile beat top-level execution:agent',
  );
});

test('Given exec-precedence manifest, when resolvePipeline is called, then implementation=agent (explicit phase field beat profile inline)', () => {
  const sut = loadDefault();
  const manifest = loadManifest('exec-precedence.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const implementation = result.effective.find(d => d.id === 'implementation');
  assert.ok(implementation, 'implementation phase should be present');
  assert.equal(
    implementation.execution,
    'agent',
    'implementation should be agent: explicit phase field beat the profile inline',
  );
});

test('Given exec-precedence manifest, when resolvePipeline is called, then validation=agent (harness-archetype caveat, not a precedence leg)', () => {
  const sut = loadDefault();
  const manifest = loadManifest('exec-precedence.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.ok(validation, 'validation phase should be present');
  assert.equal(
    validation.execution,
    'agent',
    'validation should be agent: harness-archetype caveat (stays agent regardless of profile)',
  );
});

// ─── exec-toplevel-default: isolates top-level-default precedence leg ────────

test('Given exec-toplevel-default manifest (bare execution:inline, no profile), when resolvePipeline is called, then a non-harness phase with no explicit field flips to inline', () => {
  const sut = loadDefault();
  const manifest = loadManifest('exec-toplevel-default.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);

  // design is a non-harness phase with no explicit phase-level execution override
  const design = result.effective.find(d => d.id === 'design');
  assert.ok(design, 'design phase should be present');
  assert.equal(
    design.execution,
    'inline',
    'design should be inline: top-level default beat descriptor default agent',
  );
});

test('Given exec-toplevel-default manifest, when resolvePipeline is called, then harness phases still stay agent', () => {
  const sut = loadDefault();
  const manifest = loadManifest('exec-toplevel-default.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);

  const harnessPhases = result.effective.filter(d => d.archetype === 'harness');
  for (const d of harnessPhases) {
    assert.equal(
      d.execution,
      'agent',
      `Harness phase "${d.id}" must stay agent even under top-level inline default`,
    );
  }
});

// ─── insert-bench ─────────────────────────────────────────────────────────────

test('Given manifest insert-bench, when resolvePipeline is called, then bench is present after validation', () => {
  const sut = loadDefault();
  const manifest = loadManifest('insert-bench.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);

  const ids = result.effective.map(d => d.id);
  const validationIdx = ids.indexOf('validation');
  const benchIdx = ids.indexOf('bench');

  assert.ok(benchIdx !== -1, 'bench phase should be present');
  assert.ok(benchIdx > validationIdx, 'bench should come after validation');
});

test('Given manifest insert-bench, when resolvePipeline is called, then bench consumes an artifact produced by an earlier effective phase', () => {
  const sut = loadDefault();
  const manifest = loadManifest('insert-bench.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);

  const ids = result.effective.map(d => d.id);
  const benchIdx = ids.indexOf('bench');
  const bench = result.effective[benchIdx];

  assert.ok(bench.consumes.length > 0, 'bench should consume at least one artifact');

  for (const artifact of bench.consumes) {
    const hasEarlierProducer = result.effective
      .slice(0, benchIdx)
      .some(d => d.produces.includes(artifact));
    assert.ok(
      hasEarlierProducer,
      `Artifact "${artifact}" consumed by bench must be produced by an earlier phase`,
    );
  }
});

// ─── enable-requirements ──────────────────────────────────────────────────────

test('Given manifest enable-requirements, when resolvePipeline is called, then requirements is present and ok is true', () => {
  const sut = loadDefault();
  const manifest = loadManifest('enable-requirements.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);
  assert.ok(result.effective.some(d => d.id === 'requirements'), 'requirements should be present');
});

test('Given manifest enable-requirements, when resolvePipeline is called, then requirements precedes design', () => {
  const sut = loadDefault();
  const manifest = loadManifest('enable-requirements.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const ids = result.effective.map(d => d.id);
  const reqIdx = ids.indexOf('requirements');
  const designIdx = ids.indexOf('design');
  assert.ok(reqIdx < designIdx, 'requirements should precede design');
});

// ─── record contents ──────────────────────────────────────────────────────────

test('Given a manifest with skips, when resolvePipeline is called, then record contains lines about applied edits', () => {
  const sut = loadDefault();
  const manifest = loadManifest('skip-decisions.yml');
  const result = resolvePipeline(sut, manifest);

  assert.ok(Array.isArray(result.record));
  assert.ok(result.record.length > 0, 'record should contain at least one entry for the skip');
});

test('Given no manifest, when resolvePipeline is called, then record notes default-off descriptors as default-skips', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.ok(Array.isArray(result.record));
  // requirements and architecture are default-off; they should be mentioned in the record
  const rec = result.record.join('\n');
  assert.ok(
    /requirements/i.test(rec) || /architecture/i.test(rec),
    'record should note default-off phases',
  );
});

// ─── backlog record line names the active source ───────────────────────────────

test('Given backlog { source: custom, ref: ./x.sh }, when resolvePipeline runs, then record has a line naming "custom" and the ref', () => {
  const sut = loadDefault();
  const manifest = { backlog: { source: 'custom', ref: './x.sh' } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  assert.ok(
    result.record.some(r => r.includes('custom') && r.includes('./x.sh')),
    `Expected a record line with "custom" and "./x.sh", got: ${JSON.stringify(result.record)}`,
  );
});

test('Given backlog { source: custom } with no ref, when resolvePipeline runs, then the custom record line renders a placeholder, not "undefined"', () => {
  const sut = loadDefault();
  const manifest = { backlog: { source: 'custom' } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const backlogLine = result.record.find(r => /backlog/i.test(r));
  assert.ok(backlogLine, `Expected a backlog record line, got: ${JSON.stringify(result.record)}`);
  assert.ok(backlogLine.includes('custom'), `Expected the line to name "custom", got: ${backlogLine}`);
  assert.ok(backlogLine.includes('(ref: <unspecified>)'), `Expected the placeholder token, got: ${backlogLine}`);
  assert.ok(!backlogLine.includes('undefined'), `Expected no literal "undefined" in the line, got: ${backlogLine}`);
});

test('Given backlog { source: file, ref: BACKLOG.md }, when resolvePipeline runs, then record has a line naming "file" and still matches /backlog/i', () => {
  const sut = loadDefault();
  const manifest = { backlog: { source: 'file', ref: 'BACKLOG.md' } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const backlogLine = result.record.find(r => /backlog/i.test(r));
  assert.ok(backlogLine, `Expected a backlog record line, got: ${JSON.stringify(result.record)}`);
  assert.ok(/source "file"/.test(backlogLine), `Expected the backlog line to name source "file", got: ${backlogLine}`);
  assert.ok(backlogLine.includes('BACKLOG.md'), `Expected the backlog line to include the ref value "BACKLOG.md", got: ${backlogLine}`);
});

test('Given backlog { source: file } with no ref, when resolvePipeline runs, then record line includes "<default path>"', () => {
  const sut = loadDefault();
  const manifest = { backlog: { source: 'file' } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const backlogLine = result.record.find(r => /backlog/i.test(r));
  assert.ok(backlogLine, `Expected a backlog record line, got: ${JSON.stringify(result.record)}`);
  assert.ok(/source "file"/.test(backlogLine), `Expected the line to name source "file", got: ${backlogLine}`);
  assert.ok(backlogLine.includes('<default path>'), `Expected the placeholder "<default path>", got: ${backlogLine}`);
});

test('Given backlog null, when resolvePipeline runs, then result is ok and no backlog source line is emitted', () => {
  const sut = loadDefault();

  const result = resolvePipeline(sut, { backlog: null });

  assert.equal(result.ok, true);
  assert.ok(
    !result.record.some(r => /source "(file|custom)"/.test(r)),
    `Expected no source-named backlog line for a null backlog, got: ${JSON.stringify(result.record)}`,
  );
});

test('Given backlog as a bare string, when resolvePipeline runs, then it does not throw and emits no backlog source line', () => {
  const sut = loadDefault();
  const manifest = { backlog: 'PROJ-42' };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  assert.ok(
    !result.record.some(r => /source "(file|custom)"/.test(r)),
    `Expected no source-named backlog line for a bare-string backlog, got: ${JSON.stringify(result.record)}`,
  );
});

test('Given no backlog key, when resolvePipeline runs, then record has no backlog source line', () => {
  const sut = loadDefault();
  const manifest = {};

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  assert.ok(
    !result.record.some(r => /source "(file|custom)"/.test(r)),
    `Expected no source-named backlog line when backlog is absent, got: ${JSON.stringify(result.record)}`,
  );
});

// ─── forward shape: gateDecisions + waivers present as empty arrays ───────────

test('Given any manifest, when resolvePipeline is called, then result includes gateDecisions and waivers as empty arrays', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.ok(Array.isArray(result.gateDecisions), 'gateDecisions should be an array');
  assert.ok(Array.isArray(result.waivers), 'waivers should be an array');
});

// ─── reorder wiring ───────────────────────────────────────────────────────────

test('Given pipeline.reorder containing an alias id (mutation), when resolvePipeline runs, then ok:true and reorder applies via canonical id', () => {
  const sut = loadDefault();
  const manifest = { pipeline: { reorder: ['mutation', 'review'] } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${JSON.stringify(result.errors)}`);
  const ids = result.effective.map(d => d.id);
  assert.ok(ids.indexOf('validation') < ids.indexOf('review'),
    'validation (alias: mutation) must precede review after reorder');
});

test('Given pipeline.reorder containing an unknown id, when resolvePipeline runs, then ok:false with unknown-id error and the prior edit records surfaced', () => {
  const sut = loadDefault();
  const manifest = { pipeline: { reorder: ['ghost-phase'] } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('"ghost-phase"') && e.includes('not present')));
  // The reorder guard surfaces the records computed before it (the two default-skips),
  // consistent with the strand/graph early-returns — not an empty record.
  assert.deepEqual(result.record, [
    'default-skip: requirements (descriptor enabled:false)',
    'default-skip: architecture (descriptor enabled:false)',
  ]);
});

test('Given pipeline.reorder: [validation, review], when resolvePipeline runs, then effective has validation before review with ordered record lines', () => {
  const sut = loadDefault();
  const manifest = { pipeline: { reorder: ['validation', 'review'] } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${JSON.stringify(result.errors)}`);
  const ids = result.effective.map(d => d.id);
  assert.ok(ids.indexOf('validation') < ids.indexOf('review'),
    'validation must precede review after reorder');
  const r1 = result.record.indexOf('reorder: validation (pipeline.reorder)');
  const r2 = result.record.indexOf('reorder: review (pipeline.reorder)');
  assert.ok(r1 !== -1 && r2 !== -1, 'both reorder record lines must be present');
  assert.ok(r1 < r2, 'reorder records must appear in reorder-list order');
});

test('Given pipeline.reorder:[validation, implementation] (consumer before producer), when resolvePipeline runs, then ok:false with a graph error (not a strand error) mentioning validation and change', () => {
  const sut = loadDefault();
  const manifest = { pipeline: { reorder: ['validation', 'implementation'] } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  const hasGraphError = result.errors.some(e => e.includes('validation') && e.includes('change'));
  assert.ok(hasGraphError, `errors must mention validation+change consumer-before-producer; got: ${JSON.stringify(result.errors)}`);
  assert.ok(!result.errors.some(e => e.startsWith('Strand:')),
    'the refusal must come from the graph check, not the strand check (no skips here)');
});

// ─── extends.phases: override-aware insert path ──────────────────────────────

test('Given extends.phases with a new-id registered phase, when resolvePipeline runs, then the registered phase lands in effective with its bundle and gate', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [{
        id: 'acme:bench',
        procedure: 'acme:bench',
        role: 'acme:bench-runner',
        archetype: 'harness',
        contract: ['harness-exec'],
        after: 'validation',
        consumes: ['change'],
        produces: ['acme-bench-report'],
        gate: 'acme-bench-runner --check',
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);
  const bench = result.effective.find(d => d.id === 'acme:bench');
  assert.ok(bench, 'acme:bench must be in effective');
  assert.deepEqual(bench.contract, ['harness-exec'], 'must carry harness-exec bundle');
  assert.equal(bench.procedure, 'acme:bench', 'must carry namespaced procedure');
  const decision = result.gateDecisions.find(g => g.phaseId === 'acme:bench');
  assert.ok(decision?.gate, 'acme:bench must have a gate decision');
});

test('Given extends.phases with a same-id-as-default registered phase, when resolvePipeline runs, then the default descriptor is replaced and the registered one occupies that id', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [{
        id: 'documentation',
        procedure: 'acme:docs',
        role: 'acme:docs-runner',
        archetype: 'delivery',
        contract: ['delivery'],
        consumes: ['design'],
        produces: ['docs'],
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);
  const docPhase = result.effective.find(d => d.id === 'documentation');
  assert.ok(docPhase, 'documentation must still be in effective');
  assert.equal(docPhase.procedure, 'acme:docs', 'replaced descriptor must carry registered procedure');
  assert.equal(docPhase.role, 'acme:docs-runner', 'replaced descriptor must carry registered role');
  assert.ok(
    !result.effective.some(d => d.procedure === 'craft:documentation'),
    'original craft:documentation procedure must be gone',
  );
  const idCount = result.effective.filter(d => d.id === 'documentation').length;
  assert.equal(idCount, 1, 'exactly one descriptor must occupy the documentation id');
});

test('Given two new-id registrations colliding on the same new id, when resolvePipeline runs, then ok:false with Duplicate descriptor id error', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [
        {
          id: 'acme:new-phase',
          procedure: 'acme:new-phase',
          archetype: 'harness',
          contract: ['harness-exec'],
          after: 'validation',
          consumes: ['change'],
          produces: ['acme-out'],
        },
        {
          id: 'acme:new-phase',
          procedure: 'acme:new-phase-v2',
          archetype: 'harness',
          contract: ['harness-exec'],
          after: 'validation',
          consumes: ['change'],
          produces: ['acme-out-2'],
        },
      ],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /duplicate descriptor id/i.test(e) && e.includes('acme:new-phase')),
    `Expected Duplicate descriptor id error, got: ${result.errors.join('; ')}`,
  );
});

test('Given a same-id override omitting consumes, when resolvePipeline runs, then the replaced phase resolves with the registration consumes (not the default)', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [{
        id: 'documentation',
        procedure: 'acme:docs',
        archetype: 'delivery',
        contract: ['delivery'],
        produces: ['docs'],
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  const docPhase = result.effective.find(d => d.id === 'documentation');
  assert.ok(docPhase, 'documentation must be present');
  assert.deepEqual(
    docPhase.consumes,
    [],
    'replaced phase must have empty consumes (insert default), not the original [design, change]',
  );
});

test('Given a same-id override omitting produces and self_supply, when resolvePipeline runs, then both fields resolve to [] (insert default), not the replaced descriptor defaults', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [{
        id: 'documentation',
        procedure: 'acme:docs',
        archetype: 'delivery',
        contract: ['delivery'],
        consumes: [],
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  const docPhase = result.effective.find(d => d.id === 'documentation');
  assert.ok(docPhase, 'documentation must be present');
  assert.deepEqual(docPhase.produces, [], 'produces must be [] (insert default), not the original descriptor value');
  assert.deepEqual(docPhase.self_supply, [], 'self_supply must be [] (insert default), not the original descriptor value');
});

test('Given a registered phase consuming an artifact no prior enabled phase produces, when resolvePipeline runs, then ok:false (strand check via validatePipeline)', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [{
        id: 'acme:bench',
        procedure: 'acme:bench',
        archetype: 'harness',
        contract: ['harness-exec'],
        after: 'validation',
        consumes: ['nonexistent-artifact'],
        produces: ['acme-out'],
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('nonexistent-artifact') || e.includes('acme:bench')),
    `Expected an error naming the missing artifact or phase, got: ${result.errors.join('; ')}`,
  );
});

// ─── extends.profiles: registered profile selectable via pipeline.profile ────

test('Given extends.profiles.audit (full+typed) and pipeline.profile:audit, when resolvePipeline runs, then ok:true and construction-archetype phase resolves to audit map value', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      profiles: {
        audit: {
          setup:         'inline',
          specification: 'inline',
          construction:  'agent',
          harness:       'agent',
          refinement:    'inline',
          delivery:      'inline',
        },
      },
    },
    pipeline: { profile: 'audit' },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);
  const constructionPhase = result.effective.find(d => d.archetype === 'construction');
  assert.ok(constructionPhase, 'a construction-archetype phase must be present');
  assert.equal(constructionPhase.execution, 'agent', 'construction must resolve to audit map value: agent');
  const refinementPhase = result.effective.find(d => d.archetype === 'refinement');
  assert.ok(refinementPhase, 'a refinement-archetype phase must be present');
  assert.equal(refinementPhase.execution, 'inline', 'refinement must resolve to audit map value: inline');
});

test('Given extends.profiles.audit with harness:inline declared, when resolvePipeline runs, then harness-archetype phase is forced to agent (floor)', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      profiles: {
        audit: {
          setup:         'inline',
          specification: 'inline',
          construction:  'agent',
          harness:       'inline',
          refinement:    'inline',
          delivery:      'inline',
        },
      },
    },
    pipeline: { profile: 'audit' },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);
  const harnessPhases = result.effective.filter(d => d.archetype === 'harness');
  assert.ok(harnessPhases.length > 0, 'at least one harness-archetype phase must be present');
  for (const phase of harnessPhases) {
    assert.equal(phase.execution, 'agent', `harness phase "${phase.id}" must be forced to agent regardless of profile map`);
  }
});

test('Given pipeline.profile:ghost with no registered ghost in extends.profiles, when resolvePipeline runs, then ok:false naming the unknown profile', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      profiles: {
        audit: {
          setup: 'inline', specification: 'inline', construction: 'agent',
          harness: 'agent', refinement: 'inline', delivery: 'inline',
        },
      },
    },
    pipeline: { profile: 'ghost' },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /ghost/i.test(e)),
    `Expected error naming "ghost", got: ${result.errors.join('; ')}`,
  );
});
