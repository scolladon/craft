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
  design:         'forge:designer',
  decisions:      undefined,
  planning:       'forge:planner',
  implementation: 'forge:slice-implementer',
  review:         'forge:reviewer',
  refactoring:    'forge:refactor-executor',
  validation:     'forge:validation-triager',
  documentation:  'forge:docs-writer',
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

// ─── skip-decisions (allowed — its only consumer, planning, self-supplies it) ─

test('Given manifest skip-decisions, when resolvePipeline is called, then ok is true and decisions is absent from effective', () => {
  const sut = loadDefault();
  const manifest = loadManifest('skip-decisions.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);
  assert.ok(!result.effective.some(d => d.id === 'decisions'), 'decisions should be absent');
});

// ─── skip-planning (refused — strands implementation) ────────────────────────

test('Given manifest skip-planning, when resolvePipeline is called, then ok is false with a strand error', () => {
  const sut = loadDefault();
  const manifest = loadManifest('skip-planning.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /planning/i.test(e) || /plan/i.test(e) || /strand/i.test(e) || /implementation/i.test(e)),
    `Expected a strand error, got: ${result.errors.join('; ')}`,
  );
});

// ─── skip-workspace (refused — strands implementation) ───────────────────────

test('Given manifest skip-workspace, when resolvePipeline is called, then ok is false with a strand error', () => {
  const sut = loadDefault();
  const manifest = loadManifest('skip-workspace.yml');
  const result = resolvePipeline(sut, manifest);

  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /workspace/i.test(e) || /strand/i.test(e) || /implementation/i.test(e)),
    `Expected a strand error, got: ${result.errors.join('; ')}`,
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

// ─── exec-precedence: isolates ADR-008 precedence legs ───────────────────────

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

// ─── exec-toplevel-default: isolates third ADR-008 leg ───────────────────────

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

// ─── forward shape: gateDecisions + waivers present as empty arrays ───────────

test('Given any manifest, when resolvePipeline is called, then result includes gateDecisions and waivers as empty arrays', () => {
  const sut = loadDefault();
  const result = resolvePipeline(sut, null);

  assert.ok(Array.isArray(result.gateDecisions), 'gateDecisions should be an array');
  assert.ok(Array.isArray(result.waivers), 'waivers should be an array');
});
