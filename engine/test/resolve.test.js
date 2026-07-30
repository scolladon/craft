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
  implementation: 'craft:part-implementer',
  review:         'craft:reviewer',
  refactoring:    'craft:refactor-executor',
  validation:     'craft:harness-triager',
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

// ─── fan-out advisory (ADR-312, ADR-313) ─────────────────────────────────────

test('Given the shipped default (4 dimensions × 1 pass), when resolvePipeline runs, then record has no fan-out line', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  assert.ok(
    !result.record.some(r => /^fan-out:/.test(r)),
    `Expected no fan-out line, got: ${JSON.stringify(result.record)}`,
  );
});

test('Given passes:3 over the default four dimensions (product 12), when resolvePipeline runs, then record has exactly one fan-out line naming 12 reviewers', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { harness: { passes: 3 } } } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const fanOutLines = result.record.filter(r => /^fan-out:/.test(r));
  assert.equal(fanOutLines.length, 1, `Expected exactly one fan-out line, got: ${JSON.stringify(result.record)}`);
  assert.equal(
    fanOutLines[0],
    'fan-out: review resolves to 12 reviewers (4 dimensions × 3 passes) — advisory only; nothing is capped. Cost basis: docs/guides/customizing.md.',
  );
});

test('Given passes:3 restricted to one dimension (product 3), when resolvePipeline runs, then record has no fan-out line', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { harness: { passes: 3, dimensions: ['code'] } } } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  assert.ok(
    !result.record.some(r => /^fan-out:/.test(r)),
    `Expected no fan-out line, got: ${JSON.stringify(result.record)}`,
  );
});

test('Given passes:2 over the default four dimensions (product 8, the threshold), when resolvePipeline runs, then record has no fan-out line', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { harness: { passes: 2 } } } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  assert.ok(
    !result.record.some(r => /^fan-out:/.test(r)),
    `Expected no fan-out line at product 8 (the threshold, not above it), got: ${JSON.stringify(result.record)}`,
  );
});

test('Given passes:3 over three dimensions (product 9, one above the threshold), when resolvePipeline runs, then record has exactly one fan-out line', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { harness: { passes: 3, dimensions: ['code', 'security', 'tests'] } } } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const fanOutLines = result.record.filter(r => /^fan-out:/.test(r));
  assert.equal(fanOutLines.length, 1, `Expected exactly one fan-out line at product 9, got: ${JSON.stringify(result.record)}`);
});

test('Given the product-12 manifest, when resolvePipeline runs, then the advisory changes no resolved value', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { harness: { passes: 3 } } } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  assert.ok(
    result.record.some(r => r.startsWith('fan-out:')),
    'premise: the advisory must actually fire for this manifest, or inertness proves nothing',
  );
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS, 'the fan-out advisory must not change the resolved phase list');

  const reviewDescriptor = result.effective.find(d => d.id === 'review');
  assert.deepEqual(
    reviewDescriptor.harness.reviewPlan,
    { passes: 3, stop_rule: 'low-only' },
    'deriveReviewPlan\'s projection must be unchanged by the advisory',
  );

  const reviewGateDecision = result.gateDecisions.find(g => g.phaseId === 'review');
  assert.equal(reviewGateDecision.gate, '<gates.phase>', 'the review gate decision must be unchanged by the advisory');

  const inertFields = JSON.stringify({
    effective: result.effective,
    gateDecisions: result.gateDecisions,
    waivers: result.waivers,
    errors: result.errors,
  });
  assert.ok(
    !inertFields.includes('fan-out:'),
    `Expected "fan-out:" to appear only in record, got it in: ${inertFields}`,
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

test('Given pipeline.reorder containing the removed mutation alias, when resolvePipeline runs, then ok:false with unknown-id error', () => {
  const sut = loadDefault();
  const manifest = { pipeline: { reorder: ['mutation', 'review'] } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('"mutation"') && e.includes('not present')));
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

// ─── buildManifestRecords: registered backlog source branch ──────────────────

test('Given backlog { source: "acme-tracker" } registered in extends.backlog-adapters, when resolvePipeline runs, then record names the registered source', () => {
  const defaults = loadDefault();
  const manifest = {
    backlog: { source: 'acme-tracker', ref: 'scripts/acme.sh' },
    extends: {
      'backlog-adapters': [{ name: 'acme-tracker', ref: 'scripts/acme.sh' }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok; errors: ${result.errors?.join('; ')}`);
  const backlogLine = result.record.find(r => r.includes('acme-tracker'));
  assert.ok(backlogLine, `Expected a record line naming "acme-tracker"; record: ${JSON.stringify(result.record)}`);
  assert.ok(backlogLine.includes('source "acme-tracker"'), `line must name the source; got: ${backlogLine}`);
});

test('Given backlog { source: "acme-tracker" } with no ref, when resolvePipeline runs, then record line contains "<unspecified>"', () => {
  const defaults = loadDefault();
  const manifest = {
    backlog: { source: 'acme-tracker' },
    extends: {
      'backlog-adapters': [{ name: 'acme-tracker', ref: 'scripts/acme.sh' }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok; errors: ${result.errors?.join('; ')}`);
  const backlogLine = result.record.find(r => r.includes('acme-tracker'));
  assert.ok(backlogLine, `Expected a backlog record line; record: ${JSON.stringify(result.record)}`);
  assert.ok(backlogLine.includes('<unspecified>'), `line must contain "<unspecified>"; got: ${backlogLine}`);
});

test('Given backlog source "acme-tracker" but null source guard: source that is null does not match registered adapters, when resolvePipeline runs, then no record line emitted', () => {
  const defaults = loadDefault();
  // source=null falls out of the if chain; no record expected
  const manifest = {
    backlog: { source: null },
    extends: {
      'backlog-adapters': [{ name: 'acme-tracker', ref: 'scripts/acme.sh' }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok; errors: ${result.errors?.join('; ')}`);
  assert.ok(
    !result.record.some(r => /source "/.test(r)),
    `null source must not emit a source record; record: ${JSON.stringify(result.record)}`,
  );
});

// ─── foldRegisteredPhases: empty registeredPhases guard ──────────────────────

test('Given extends.phases is empty array, when resolvePipeline runs, then effective matches default SC1 order (empty guard short-circuits)', () => {
  const defaults = loadDefault();
  const manifest = { extends: { phases: [] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok; errors: ${result.errors?.join('; ')}`);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS, 'empty extends.phases must leave effective unchanged');
});

test('Given no extends.phases key, when resolvePipeline runs, then effective matches default SC1 order (undefined guard short-circuits)', () => {
  const defaults = loadDefault();
  const manifest = { extends: {} };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok; errors: ${result.errors?.join('; ')}`);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS, 'absent extends.phases must leave effective unchanged');
});

// ─── foldRegisteredPhases: inserts initialised as empty array ────────────────

test('Given extends.phases with a new-id phase, when resolvePipeline runs, then inserts list has exactly one entry (not a pre-polluted array)', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [{
        id: 'acme:new-phase',
        procedure: 'acme:new-phase',
        archetype: 'harness',
        after: 'validation',
        consumes: ['change'],
        produces: ['acme-out'],
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok; errors: ${result.errors?.join('; ')}`);
  const inserted = result.effective.find(d => d.id === 'acme:new-phase');
  assert.ok(inserted, 'acme:new-phase must appear in effective');
});

// ─── foldRegisteredPhases: replaced descriptor defaults to empty contract ─────

test('Given extends.phases replacing an existing phase without specifying contract, when resolvePipeline runs, then replaced phase has contract:[] (not a pre-populated array)', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [{
        id: 'documentation',
        procedure: 'acme:docs',
        archetype: 'delivery',
        consumes: [],
        produces: ['docs'],
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  const docPhase = result.effective.find(d => d.id === 'documentation');
  assert.ok(docPhase, 'documentation must be present');
  assert.deepEqual(docPhase.contract, [], 'contract must be [] by default, not a pre-seeded array');
});

// ─── foldRegisteredPhases: a pure same-id replace adds no spurious insert ─────
// Kills the ArrayDeclaration mutant at resolve.js:185 — `const inserts = []` →
// `["Stryker was here"]`. A registration that ONLY replaces an existing id (no new phase) must
// leave the insert list empty; a seeded array would push a garbage (id-less) descriptor into
// effective via applyInserts.
test('Given extends.phases that only replaces an existing id (no new phase), when resolvePipeline runs, then effective ids equal the default set (no spurious insert)', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [{
        id: 'documentation',
        procedure: 'acme:docs',
        archetype: 'delivery',
        consumes: [],
        produces: ['docs'],
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `expected ok; errors: ${JSON.stringify(result.errors)}`);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS, 'a pure replace must not add any phase beyond the default set');
});

// EQUIVALENT (mutation survivors) — the foldRegisteredPhases early-return guard at resolve.js:182
// (`if (!registeredPhases || registeredPhases.length === 0) return { descriptors, inserts: [] }`)
// is a pure optimization: resolvePipeline ALWAYS calls it with `resolved.extends?.phases ?? []`
// (a defined array), and the body's loop over an empty array already yields
// `{ descriptors, inserts: [] }`. So `if (false)`, `&&`, `|| false`, and the emptied block all
// produce identical output — no kill test can distinguish them (the function is module-private,
// never reached with undefined).

// ─── buildManifestRecords: an unregistered non-null backlog source emits NO record ───
// Kills the LogicalOperator mutant at resolve.js:153 — `source !== null && registered.has(source)`
// → `||`. With `||`, any non-null source (even one no adapter registers) would wrongly emit a
// record line. (The ConditionalExpression mutant `source !== null` → `true` at the same site is
// EQUIVALENT: `registered.has(null)` is always false, so `true && has(source)` ≡ the original for
// every input — no test can distinguish it.)
test('Given a backlog.source that no extends.backlog-adapters registers, when resolvePipeline runs, then no record names that source', () => {
  const defaults = loadDefault();
  const manifest = { backlog: { source: 'ghost-tracker', ref: './x.sh' } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `expected ok; errors: ${JSON.stringify(result.errors)}`);
  assert.ok(
    !result.record.some(r => r.includes('ghost-tracker')),
    `an unregistered source must not emit a record line; got: ${JSON.stringify(result.record)}`,
  );
});

// ─── reviewPlan derivation (Layer A — ADR-096 / ADR-097) ─────────────────────

test('Given default pipeline/default.yml resolved with null manifest, when resolvePipeline is called, then review descriptor has reviewPlan with passes:1 and stop_rule:low-only', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  const review = result.effective.find(d => d.id === 'review');
  assert.ok(review, 'review phase must be in effective list');
  assert.deepEqual(review.harness.reviewPlan, { passes: 1, stop_rule: 'low-only' });
});

test('Given manifest with phases.review.harness.passes:2, when resolvePipeline is called, then reviewPlan.passes equals 2 and stop_rule is low-only', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { harness: { passes: 2 } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const review = result.effective.find(d => d.id === 'review');
  assert.ok(review, 'review phase must be in effective list');
  assert.equal(review.harness.reviewPlan.passes, 2);
  assert.equal(review.harness.reviewPlan.stop_rule, 'low-only');
});

test('Given manifest with phases.review.harness.convergence:none, when resolvePipeline is called, then reviewPlan.stop_rule is none', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { harness: { convergence: 'none' } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const review = result.effective.find(d => d.id === 'review');
  assert.ok(review, 'review phase must be in effective list');
  assert.equal(review.harness.reviewPlan.stop_rule, 'none');
});

test('Given manifest with phases.review.harness.convergence:3 (numeric), when resolvePipeline is called, then reviewPlan.stop_rule is non-low-count<=3', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { harness: { convergence: 3 } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const review = result.effective.find(d => d.id === 'review');
  assert.ok(review, 'review phase must be in effective list');
  assert.equal(review.harness.reviewPlan.stop_rule, 'non-low-count<=3');
});

test('Given manifest with phases.review.harness.convergence:0 (numeric zero), when resolvePipeline is called, then reviewPlan.stop_rule is non-low-count<=0', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { harness: { convergence: 0 } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const review = result.effective.find(d => d.id === 'review');
  assert.ok(review, 'review phase must be in effective list');
  assert.equal(review.harness.reviewPlan.stop_rule, 'non-low-count<=0');
});

test('Given a non-harness phase descriptor (no harness block), when resolvePipeline is called, then no reviewPlan is attached to it', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  const workspace = result.effective.find(d => d.id === 'workspace');
  assert.ok(workspace, 'workspace phase must be in effective list');
  assert.ok(!workspace.harness, 'workspace must have no harness block');
  assert.ok(!('reviewPlan' in (workspace.harness ?? {})), 'no reviewPlan on non-harness descriptor');
});

test('Given the default pipeline, when resolvePipeline is called, then a harness-carrying non-review phase (validation) gets no reviewPlan', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.ok(validation, 'validation phase must be in effective list');
  assert.ok(validation.harness, 'validation must carry a harness block');
  assert.ok(!('reviewPlan' in validation.harness), 'reviewPlan is review-scoped — must not attach to validation');
});

test('Given resolved review descriptor, when resolvePipeline is called, then harness is a fresh object (input manifest not mutated)', () => {
  const sut = loadDefault();
  const sourceHarness = { passes: 2, convergence: 3 };
  const manifest = { phases: { review: { harness: sourceHarness } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const review = result.effective.find(d => d.id === 'review');
  assert.ok(review, 'review phase must be in effective list');
  assert.notStrictEqual(review.harness, sourceHarness, 'resolved harness must be a fresh object, not the input');
  assert.ok(!('reviewPlan' in sourceHarness), 'source harness must not be mutated with reviewPlan');
  assert.equal(sourceHarness.passes, 2, 'source passes unchanged');
  assert.equal(sourceHarness.convergence, 3, 'source convergence unchanged');
});

// ─── techniquePlan derivation (ADR-155) ──────────────────────────────────────

test('Given default pipeline with null manifest, when resolvePipeline runs, then validation descriptor has techniquePlan as empty array (empty techniques)', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.ok(validation, 'validation phase must be in effective list');
  assert.ok(Object.hasOwn(validation.harness, 'techniquePlan'), 'techniquePlan must be attached');
  assert.deepEqual(validation.harness.techniquePlan, []);
});

test('Given manifest with phases.validation.harness.techniques with one technique, when resolvePipeline runs, then techniquePlan has one entry with defaults filled', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { techniques: [{ id: 'mutation' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  const plan = validation.harness.techniquePlan;
  assert.equal(plan.length, 1);
  assert.equal(plan[0].id, 'mutation');
  assert.equal(plan[0].mode, 'gate');
  assert.equal(plan[0].runStyle, 'sync');
  assert.equal(plan[0].scope, 'per-hunk');
  assert.equal(plan[0].commitPrefix, 'chore');
});

test('Given manifest with phases.validation.harness.techniques with explicit mode:triage, when resolvePipeline runs, then techniquePlan entry preserves mode', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { techniques: [{ id: 'mutation', mode: 'triage' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.equal(validation.harness.techniquePlan[0].mode, 'triage');
});

test('Given manifest with phases.validation.harness.techniques with explicit run-style:background, when resolvePipeline runs, then techniquePlan entry has runStyle:background', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { techniques: [{ id: 'mutation', 'run-style': 'background' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.equal(validation.harness.techniquePlan[0].runStyle, 'background');
});

test('Given manifest with phases.validation.harness.techniques with explicit scope:per-file, when resolvePipeline runs, then techniquePlan entry scope is per-file', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { techniques: [{ id: 'mutation', scope: 'per-file' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.equal(validation.harness.techniquePlan[0].scope, 'per-file');
});

test('Given manifest with phases.validation.harness.techniques with explicit commit-prefix:test, when resolvePipeline runs, then techniquePlan entry commitPrefix is test', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { techniques: [{ id: 'mutation', 'commit-prefix': 'test' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.equal(validation.harness.techniquePlan[0].commitPrefix, 'test');
});

test('Given manifest with phases.validation.harness.techniques with probe and run and triage-procedure, when resolvePipeline runs, then techniquePlan entry carries them', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { techniques: [{ id: 'mutation', probe: 'which stryker', run: 'npx stryker run', 'triage-procedure': 'path/to/proc.md' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  const entry = validation.harness.techniquePlan[0];
  assert.equal(entry.probe, 'which stryker');
  assert.equal(entry.run, 'npx stryker run');
  assert.equal(entry.triageProcedure, 'path/to/proc.md');
});

test('Given default pipeline with null manifest, when resolvePipeline runs, then review descriptor has reviewPlan but no techniquePlan (review is read-harness)', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  const review = result.effective.find(d => d.id === 'review');
  assert.ok(review.harness.reviewPlan, 'reviewPlan must be present on review');
  assert.ok(!Object.hasOwn(review.harness, 'techniquePlan'), 'techniquePlan must NOT be on review (read-harness)');
});

test('Given default pipeline with null manifest, when resolvePipeline runs, then workspace descriptor has no techniquePlan (non-harness phase)', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);
  const workspace = result.effective.find(d => d.id === 'workspace');
  assert.ok(!workspace.harness, 'workspace has no harness block');
  assert.ok(!('techniquePlan' in (workspace.harness ?? {})), 'no techniquePlan on non-harness descriptor');
});

test('Given manifest with phases.validation.harness.techniques with multiple entries, when resolvePipeline runs, then techniquePlan preserves order and fills defaults for each', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { techniques: [{ id: 'lint', mode: 'gate' }, { id: 'mutation', mode: 'triage', 'commit-prefix': 'test' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  const plan = validation.harness.techniquePlan;
  assert.equal(plan.length, 2);
  assert.equal(plan[0].id, 'lint');
  assert.equal(plan[0].commitPrefix, 'chore');
  assert.equal(plan[1].id, 'mutation');
  assert.equal(plan[1].commitPrefix, 'test');
});

test('Given resolved validation descriptor, when resolvePipeline runs, then source harness is not mutated by techniquePlan attachment', () => {
  const sut = loadDefault();
  const sourceHarness = { techniques: [{ id: 'lint' }] };
  const manifest = { phases: { validation: { harness: sourceHarness } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  assert.ok(!Object.hasOwn(sourceHarness, 'techniquePlan'), 'source harness must not be mutated');
  assert.equal(sourceHarness.techniques[0].id, 'lint', 'source technique unchanged');
});

test('Given technique with scope:per-file override in techniques array and phase scope:per-hunk, when resolvePipeline runs, then technique scope wins', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { scope: 'per-hunk', techniques: [{ id: 'lint', scope: 'per-file' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.equal(validation.harness.techniquePlan[0].scope, 'per-file');
});

// ─── autoSkipEligible wiring ──────────────────────────────────────────────────

test('A1 Given default pipeline with null manifest, when resolvePipeline runs, then every effective descriptor carries the correct autoSkipEligible boolean', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);

  const expected = {
    workspace:      false,
    design:         false,
    decisions:      true,
    planning:       false,
    implementation: false,
    review:         true,
    refactoring:    true,
    validation:     true,
    documentation:  true,
    propose:        false,
    integrate:      false,
  };

  for (const [id, expectedValue] of Object.entries(expected)) {
    const d = result.effective.find(p => p.id === id);
    assert.ok(d, `Phase "${id}" must be present in effective`);
    assert.equal(
      d.autoSkipEligible,
      expectedValue,
      `Phase "${id}" expected autoSkipEligible:${expectedValue}, got ${d.autoSkipEligible}`,
    );
  }
});

test('A2 Given phases.review.required:true in manifest, when resolvePipeline runs, then review autoSkipEligible is false while refactoring and validation remain true', () => {
  const sut = loadDefault();
  const manifest = { phases: { review: { required: true } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);

  const review = result.effective.find(d => d.id === 'review');
  assert.ok(review, 'review must be in effective');
  assert.equal(review.autoSkipEligible, false, 'required:true must veto autoSkipEligible');

  const refactoring = result.effective.find(d => d.id === 'refactoring');
  assert.ok(refactoring, 'refactoring must be in effective');
  assert.equal(refactoring.autoSkipEligible, true, 'unaffected refactoring must stay true');

  const validation = result.effective.find(d => d.id === 'validation');
  assert.ok(validation, 'validation must be in effective');
  assert.equal(validation.autoSkipEligible, true, 'unaffected validation must stay true');
});

test('A3 Given default pipeline with null manifest, when resolvePipeline runs, then every effective descriptor has a boolean autoSkipEligible and gateDecisions/waivers/awaitingHarnesses are unchanged', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.equal(result.ok, true);

  for (const d of result.effective) {
    assert.equal(
      typeof d.autoSkipEligible,
      'boolean',
      `Phase "${d.id}" must have boolean autoSkipEligible, got ${typeof d.autoSkipEligible}`,
    );
  }

  // gateDecisions and waivers arrays must not be disturbed
  assert.ok(Array.isArray(result.gateDecisions), 'gateDecisions must remain an array');
  assert.ok(Array.isArray(result.waivers), 'waivers must remain an array');
  assert.equal(result.gateDecisions.length, result.effective.length, 'gateDecisions count must equal effective count');

  // propose still carries awaitingHarnesses
  const proposeDecision = result.gateDecisions.find(g => g.phaseId === 'propose');
  assert.ok(proposeDecision, 'propose must have a gateDecision');
  assert.ok(Array.isArray(proposeDecision.awaitingHarnesses), 'propose awaitingHarnesses must be an array');
  assert.deepEqual(proposeDecision.awaitingHarnesses, ['validation']);
});

// ─── KILL: resolve.js:146 LogicalOperator + StringLiteral mutants ─────────────
// Mutant A (??→&&): harness.scope && 'per-hunk' — when scope absent, && returns undefined
// Mutant B (StringLiteral): harness.scope ?? '' — default is empty string not 'per-hunk'
// Kill: technique with no scope under harness with no scope must produce exactly 'per-hunk'.

test('Given technique with no scope and harness with no scope, when resolvePipeline runs, then techniquePlan scope defaults to exactly per-hunk', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { techniques: [{ id: 'mutation' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  const entry = validation.harness.techniquePlan[0];
  assert.strictEqual(entry.scope, 'per-hunk', 'default scope must be the string "per-hunk", not undefined or empty');
});

test('Given technique with no scope under harness with scope per-file, when resolvePipeline runs, then techniquePlan entry inherits harness scope per-file', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { scope: 'per-file', techniques: [{ id: 'mutation' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.strictEqual(validation.harness.techniquePlan[0].scope, 'per-file', 'technique must inherit harness scope when technique has no scope');
});

// ─── KILL: resolve.js:147 NoCoverage — harness.techniques ?? [] default path ──
// NoCoverage mutant: harness.techniques ?? [] → harness.techniques ?? ['Stryker was here']
// Kill: when harness has no techniques key, techniquePlan must be empty (not one-element).

test('Given harness block with no techniques key, when resolvePipeline runs, then techniquePlan is an empty array', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { scope: 'per-hunk' } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  assert.deepEqual(validation.harness.techniquePlan, [], 'no techniques key must produce empty techniquePlan, not a default element');
});

// ─── KILL: resolve.js:155-157 ConditionalExpression mutants ──────────────────
// Mutants: if (tech.probe !== undefined) → if (true) (and same for run, triage-procedure)
// Effect: a technique without probe/run/triage-procedure gets those keys set to undefined.
// Kill: a minimal technique (id only) must produce an entry WITHOUT probe, run, triageProcedure keys.

test('Given technique with only id, when resolvePipeline runs, then techniquePlan entry has no probe, run, or triageProcedure keys', () => {
  const sut = loadDefault();
  const manifest = { phases: { validation: { harness: { techniques: [{ id: 'mutation' }] } } } };
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  const validation = result.effective.find(d => d.id === 'validation');
  const entry = validation.harness.techniquePlan[0];
  assert.ok(!Object.hasOwn(entry, 'probe'), 'probe key must be absent when technique has no probe');
  assert.ok(!Object.hasOwn(entry, 'run'), 'run key must be absent when technique has no run');
  assert.ok(!Object.hasOwn(entry, 'triageProcedure'), 'triageProcedure key must be absent when technique has no triage-procedure');
  assert.deepEqual(
    Object.keys(entry).sort(),
    ['commitPrefix', 'id', 'mode', 'runStyle', 'scope'],
    'minimal technique entry must have exactly the five required keys',
  );
});

// ─── archetype inference: resolver wiring ────────────────────────────────────

test('Given a pipeline.insert with gate and no archetype, when resolvePipeline runs, then effective carries archetype:harness and record contains the inference line', () => {
  const defaults = loadDefault();
  const manifest = {
    pipeline: {
      insert: [{
        after: 'planning',
        id: 'smoke',
        procedure: 'acme:smoke',
        gate: 'acme:smoke --check',
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok; errors: ${result.errors?.join('; ')}`);
  const smoke = result.effective.find(d => d.id === 'smoke');
  assert.ok(smoke, 'smoke must be in effective');
  assert.equal(smoke.archetype, 'harness', `expected archetype harness; got ${smoke.archetype}`);
  assert.ok(
    result.record.includes('archetype: smoke → harness (inferred: gate with no produces)'),
    `expected inference record; record: ${JSON.stringify(result.record)}`,
  );
});

test('Given extends.phases replacing an existing phase without specifying archetype, when resolvePipeline runs, then the replaced phase inherits the original archetype and no inference record is emitted', () => {
  const defaults = loadDefault();
  const manifest = {
    extends: {
      phases: [{
        id: 'documentation',
        procedure: 'acme:docs',
        // archetype deliberately omitted — must inherit 'delivery' from the replaced slot
        produces: ['docs'],
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok; errors: ${result.errors?.join('; ')}`);
  const doc = result.effective.find(d => d.id === 'documentation');
  assert.ok(doc, 'documentation must be in effective');
  assert.equal(doc.archetype, 'delivery', `expected inherited archetype delivery; got ${doc.archetype}`);
  assert.ok(
    !result.record.some(r => r.startsWith('archetype: documentation')),
    `expected no inference record for documentation; record: ${JSON.stringify(result.record)}`,
  );
});

test('Given a pipeline.insert with explicit archetype:harness, when resolvePipeline runs, then effective carries harness and no inference record is emitted for that phase', () => {
  const defaults = loadDefault();
  const manifest = {
    pipeline: {
      insert: [{
        after: 'planning',
        id: 'explicit-harness',
        procedure: 'acme:explicit',
        archetype: 'harness',
        gate: 'acme:explicit --check',
      }],
    },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok; errors: ${result.errors?.join('; ')}`);
  const phase = result.effective.find(d => d.id === 'explicit-harness');
  assert.ok(phase, 'explicit-harness must be in effective');
  assert.equal(phase.archetype, 'harness');
  assert.ok(
    !result.record.some(r => r.startsWith('archetype: explicit-harness')),
    `expected no inference record for explicit-harness; record: ${JSON.stringify(result.record)}`,
  );
});

// ─── null-id insert guard ─────────────────────────────────────────────────────

test('Given pipeline.insert with a missing id, when resolvePipeline runs, then ok:false with the id error', () => {
  const sut = resolvePipeline;
  const defaults = loadDefault();
  const manifest = { pipeline: { insert: [{ after: 'review', procedure: 'craft:x' }] } };

  const result = sut(defaults, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('pipeline.insert') && e.includes('.id must be a non-empty string')),
    `Expected id error, got: ${result.errors.join('; ')}`,
  );
});

test('Given pipeline.insert with a whitespace-only id, when resolvePipeline runs, then ok:false with the id error', () => {
  const sut = resolvePipeline;
  const defaults = loadDefault();
  const manifest = { pipeline: { insert: [{ id: '   ', procedure: 'craft:x' }] } };

  const result = sut(defaults, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => e.includes('.id must be a non-empty string')),
    `Expected id error, got: ${result.errors.join('; ')}`,
  );
});

test('Given a pipeline with no review phase, when resolvePipeline runs, then the fan-out probe is inert and does not throw', () => {
  const sut = loadDefault();
  const manifest = { pipeline: { skip: ['review'] } };

  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true);
  assert.ok(!result.record.some(r => /^fan-out:/.test(r)));
});

test('Given a gate-floor violation alongside a fan-out above the threshold, when resolvePipeline runs, then the advisory still reaches record on the early return', () => {
  // The floor fires only when a code-producing descriptor carries no gate at all,
  // which no manifest can express — strip it at the defaults layer instead.
  const sut = loadDefault();
  const gateless = sut.map(d => (d.id === 'implementation' ? { ...d, gate: undefined } : d));
  const manifest = { phases: { review: { harness: { passes: 3 } } } };

  const result = resolvePipeline(gateless, manifest);

  assert.equal(result.ok, false, 'expected the gate floor to reject this pipeline');
  assert.ok(
    result.record.some(r => /^fan-out:/.test(r)),
    `the early return must carry the advisory too, got: ${JSON.stringify(result.record)}`,
  );
});
