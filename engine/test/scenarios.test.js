/**
 * Scenario golden suite — S1..S9 + SC1 anchor.
 *
 * Each scenario runs resolvePipeline against a manifest fixture and asserts
 * specific slices of the Resolution. Gate/waiver assertions exercise the
 * gate-decision layer that this slice lands.
 *
 * NOTE: S6 (backlog adapter) and S7 (namespaced registration) are PARTIAL at P1.
 * Resolution-layer behavior is asserted; their ports/UX land at P11/P14.
 * These logs are intentional — the suite must not be read as "fully covered."
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { load } from 'js-yaml';
import { parsePipeline } from '../src/descriptor.js';
import { resolvePipeline } from '../src/resolve.js';
import { assembleContract } from '../src/contract.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const defaultYml = join(__dir, '..', '..', 'pipeline', 'default.yml');
const scenariosDir = join(__dir, 'fixtures', 'scenarios');
const contractsDir = join(__dir, 'fixtures', 'contracts');

// ─── helpers ────────────────────────────────────────────────────────────────

function loadDefault() {
  return parsePipeline(readFileSync(defaultYml, 'utf8'));
}

function loadScenarioManifest(scenario) {
  const text = readFileSync(join(scenariosDir, scenario, 'manifest.yml'), 'utf8');
  return load(text) ?? {};
}

function readBundle(name) {
  return readFileSync(join(contractsDir, `${name}.md`), 'utf8');
}

const FRAGMENTS = {
  core:           readBundle('core'),
  producer:       readBundle('producer'),
  construction:   readBundle('construction'),
  'harness-read': readBundle('harness-read'),
  'harness-exec': readBundle('harness-exec'),
  delivery:       readBundle('delivery'),
};

// Canonical SC1 phase order (11 enabled phases)
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

// Code-producing phases: those whose produces[] includes 'change'.
// In the default pipeline these are implementation and refactoring.
// review produces review-report; validation produces validation-report.
// The floor is data-driven: change ∈ produces is the criterion.
const CODE_PRODUCING_IDS = ['implementation', 'refactoring'];

// Executing-harness archetype phases in the default pipeline
const EXECUTING_HARNESS_IDS = ['validation'];

// ─── SC1: zero-config golden ─────────────────────────────────────────────────

test('SC1 Given no manifest, when resolvePipeline runs, then 11 enabled phases in canonical order with all executions agent', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS);
  for (const d of result.effective) {
    assert.equal(d.execution, 'agent', `${d.id} should default to agent execution`);
  }
});

test('SC1 Given no manifest, when resolvePipeline runs, then gateDecisions populated for all effective phases', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.equal(result.gateDecisions.length, SC1_IDS.length);

  for (const d of result.effective) {
    const decision = result.gateDecisions.find(g => g.phaseId === d.id);
    assert.ok(decision, `gateDecisions must have entry for ${d.id}`);
    assert.equal(typeof decision.gate, 'string', `${d.id} gate must be a string`);
    assert.equal(typeof decision.codeProducing, 'boolean', `${d.id} codeProducing must be a boolean`);
  }
});

test('SC1 Given no manifest, when resolvePipeline runs, then code-producing floor passes (each code-producing phase has a gate)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  for (const id of CODE_PRODUCING_IDS) {
    const decision = result.gateDecisions.find(g => g.phaseId === id);
    assert.ok(decision, `gateDecisions must have entry for code-producing phase ${id}`);
    assert.equal(decision.codeProducing, true, `${id} must be marked code-producing`);
    assert.ok(decision.gate, `${id} must have a non-empty gate (floor passes)`);
  }
});

test('SC1 Given no manifest, when resolvePipeline runs, then propose gateDecisions reflects executing-harness ordering invariant', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const proposeDecision = result.gateDecisions.find(g => g.phaseId === 'propose');
  assert.ok(proposeDecision, 'propose must have a gateDecision entry');
  assert.ok(
    Array.isArray(proposeDecision.awaitingHarnesses),
    'propose gateDecision must list awaitingHarnesses',
  );
  // validation is the only default-enabled executing-harness
  assert.ok(
    proposeDecision.awaitingHarnesses.includes('validation'),
    'propose must await validation (executing-harness)',
  );
});

test('SC1 Given no manifest, when resolvePipeline runs, then waivers is empty (no phases skipped)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.waivers, []);
});

// ─── S1: profile:solo ────────────────────────────────────────────────────────

test('S1 Given profile:solo manifest, when resolvePipeline runs, then non-harness phases run inline', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const harnessIds = new Set(result.effective.filter(d => d.archetype === 'harness').map(d => d.id));
  for (const d of result.effective) {
    if (harnessIds.has(d.id)) {
      assert.equal(d.execution, 'agent', `harness phase ${d.id} must stay agent under solo profile`);
    } else {
      assert.equal(d.execution, 'inline', `non-harness phase ${d.id} must be inline under solo profile`);
    }
  }
});

test('S1 Given profile:solo manifest, when resolvePipeline runs, then gateDecisions populated for all phases', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.equal(result.gateDecisions.length, result.effective.length);
});

// ─── S2: role swap + assembleContract check ──────────────────────────────────

test('S2 Given phases.planning.role:my:domain-planner, when resolvePipeline runs, then Resolution shows swapped role', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S2');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const planning = result.effective.find(d => d.id === 'planning');
  assert.ok(planning, 'planning must be in effective pipeline');
  assert.equal(planning.role, 'my:domain-planner', 'planning role must be swapped');
});

test('S2 Given phases.planning.role swapped, when assembleContract runs on planning descriptor, then U core and producer bundle still inject', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S2');
  const resolveResult = resolvePipeline(defaults, manifest);
  assert.equal(resolveResult.ok, true);

  const planningDescriptor = resolveResult.effective.find(d => d.id === 'planning');
  assert.ok(planningDescriptor, 'planning must be in effective pipeline');

  const sut = assembleContract;

  const result = sut(planningDescriptor, manifest, FRAGMENTS, {});

  // U core is always present
  assert.ok(result.includes('Never commit on a red gate'), 'U core must be present');
  // producer bundle must be present (planning has contract:[producer])
  assert.ok(result.includes('Decision-candidates'), 'producer bundle must be present (contains Decision-candidates marker)');
});

// ─── S3: insert bench phase with gate ────────────────────────────────────────

test('S3 Given insert bench after validation, when resolvePipeline runs, then bench joins the pipeline', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const ids = result.effective.map(d => d.id);
  const validationIdx = ids.indexOf('validation');
  const benchIdx = ids.indexOf('bench');
  assert.ok(benchIdx !== -1, 'bench must be in effective pipeline');
  assert.ok(benchIdx > validationIdx, 'bench must come after validation');
});

test('S3 Given insert bench with gate, when resolvePipeline runs, then gateDecisions includes bench with resolved gate', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const benchDecision = result.gateDecisions.find(g => g.phaseId === 'bench');
  assert.ok(benchDecision, 'gateDecisions must include bench');
  assert.ok(benchDecision.gate, 'bench must have a resolved gate');
});

// ─── S4: requirements enabled — graph valid ───────────────────────────────────

test('S4 Given phases.requirements.enabled:true, when resolvePipeline runs, then requirements is in effective pipeline', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S4');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const ids = result.effective.map(d => d.id);
  assert.ok(ids.includes('requirements'), 'requirements must be enabled');
});

test('S4 Given requirements enabled, when resolvePipeline runs, then graph is valid (no errors)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S4');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

// ─── S5: architecture enabled — harness gate resolved ────────────────────────

test('S5 Given phases.architecture.enabled:true, when resolvePipeline runs, then architecture is in effective pipeline', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S5');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const ids = result.effective.map(d => d.id);
  assert.ok(ids.includes('architecture'), 'architecture must be enabled');
});

test('S5 Given architecture enabled, when resolvePipeline runs, then architecture gateDecision has resolved gate', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S5');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const archDecision = result.gateDecisions.find(g => g.phaseId === 'architecture');
  assert.ok(archDecision, 'gateDecisions must include architecture');
  assert.ok(archDecision.gate, 'architecture must have a resolved gate');
});

test('S5 Given architecture enabled, when resolvePipeline runs, then propose awaits both validation and architecture', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S5');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const proposeDecision = result.gateDecisions.find(g => g.phaseId === 'propose');
  assert.ok(proposeDecision, 'propose must have a gateDecision');
  assert.ok(proposeDecision.awaitingHarnesses.includes('validation'), 'propose must await validation');
  assert.ok(proposeDecision.awaitingHarnesses.includes('architecture'), 'propose must await architecture');
});

// ─── S6: backlog declared — record marks Backlog.resolve required ─────────────
// NOTE: Partial coverage at P1. The Backlog adapter implementation lands at P11.
// This scenario asserts only the resolution-layer record entry.

test('S6 Given backlog declared in manifest, when resolvePipeline runs, then record mentions Backlog.resolve required', () => {
  console.log('S6 NOTE: Partial P1 coverage — Backlog adapter port/UX lands at P11.');
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S6');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const hasBacklogRecord = result.record.some(r => r.toLowerCase().includes('backlog'));
  assert.ok(hasBacklogRecord, 'record must mention Backlog.resolve when backlog: is declared');
});

// ─── S7: namespaced acme:bench phase ─────────────────────────────────────────
// NOTE: Partial coverage at P1. Full namespaced registration UX lands at P14.
// This scenario asserts the resolution-layer acceptance of namespaced ids.

test('S7 Given namespaced acme:bench insert, when resolvePipeline runs, then it is accepted and in effective pipeline', () => {
  console.log('S7 NOTE: Partial P1 coverage — namespaced registration/UX lands at P14.');
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S7');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const ids = result.effective.map(d => d.id);
  assert.ok(ids.includes('acme:bench'), 'acme:bench must be accepted in effective pipeline');
});

test('S7 Given acme:bench with gate, when resolvePipeline runs, then gateDecisions includes acme:bench with gate', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S7');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const decision = result.gateDecisions.find(g => g.phaseId === 'acme:bench');
  assert.ok(decision, 'gateDecisions must include acme:bench');
  assert.ok(decision.gate, 'acme:bench must have a resolved gate');
});

// ─── S8: models.fallback + degraded tier ─────────────────────────────────────

test('S8 Given models.fallback:haiku, when resolvePipeline runs, then record captures fallback policy', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S8');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const hasFallbackRecord = result.record.some(r => r.toLowerCase().includes('fallback'));
  assert.ok(hasFallbackRecord, 'record must capture models.fallback policy when declared');
});

test('S8 Given models.fallback:haiku, when resolvePipeline runs, then gateDecisions still populated', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S8');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.ok(result.gateDecisions.length > 0, 'gateDecisions must be populated');
});

// ─── S9: retrieval derived — assembleContract check ──────────────────────────

test('S9 Given retrieval declared in manifest, when assembleContract runs, then derived retrieval note is present in output', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S9');
  const resolveResult = resolvePipeline(defaults, manifest);
  assert.equal(resolveResult.ok, true);

  const designDescriptor = resolveResult.effective.find(d => d.id === 'design');
  assert.ok(designDescriptor, 'design must be in effective pipeline');

  const sut = assembleContract;

  const result = sut(designDescriptor, manifest, FRAGMENTS, {});

  assert.ok(result.includes('retrieval'), 'derived retrieval note must be in the assembled contract');
});

test('S9 Given retrieval derived, when assembleContract runs, then no retrieval strings live in bundle fixtures themselves', () => {
  // All bundle fragments must be retrieval-free; the engine derives and injects the note
  for (const [name, content] of Object.entries(FRAGMENTS)) {
    if (name === 'core') continue; // core may carry the carve-out marker text but not a strategy
    const hasRetrieval = content.toLowerCase().includes('retrieval:');
    assert.ok(!hasRetrieval, `Bundle "${name}" must not contain retrieval strategy strings`);
  }
});

// ─── gate floor: code-producing phase with no resolvable gate refuses ─────────

test('Given a code-producing phase with no gate in descriptor or manifest, when resolvePipeline runs, then it refuses', () => {
  // Build a minimal descriptor list with implementation having no gate (no descriptor.gate)
  const minimalYaml = [
    '- id: workspace',
    '  archetype: setup',
    '  contract: []',
    '  procedure: forge:workspace',
    '  produces: [workspace]',
    '- id: implementation',
    '  archetype: construction',
    '  contract: [construction]',
    '  procedure: forge:implementation',
    '  role: forge:slice-implementer',
    '  consumes: [workspace]',
    '  produces: [change]',
  ].join('\n');
  const descriptors = parsePipeline(minimalYaml);

  const sut = resolvePipeline;

  const result = sut(descriptors, null);

  assert.equal(result.ok, false);
  const hasFloorError = result.errors.some(
    e => e.toLowerCase().includes('gate') && e.includes('implementation'),
  );
  assert.ok(hasFloorError, `errors must mention the code-producing floor violation for implementation; got: ${JSON.stringify(result.errors)}`);
});

// ─── harness waiver: skipped validation releases propose-gate ─────────────────

test('Given pipeline.skip:[validation], when resolvePipeline runs, then waivers includes a validation waiver', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { skip: ['validation'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const hasWaiver = result.waivers.some(w => w.phaseId === 'validation');
  assert.ok(hasWaiver, 'waivers must record a validation waiver when validation is skipped');
});

test('Given pipeline.skip:[validation], when resolvePipeline runs, then propose-gate is released with a record line', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { skip: ['validation'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const hasGateRelease = result.record.some(r =>
    r.toLowerCase().includes('propose') && r.toLowerCase().includes('gate'),
  );
  assert.ok(hasGateRelease, `record must include a propose-gate release line; got: ${JSON.stringify(result.record)}`);
});

test('Given pipeline.skip:[validation], when resolvePipeline runs, then propose awaitingHarnesses does not include validation', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { skip: ['validation'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const proposeDecision = result.gateDecisions.find(g => g.phaseId === 'propose');
  assert.ok(proposeDecision, 'propose must have a gateDecision');
  assert.ok(
    !proposeDecision.awaitingHarnesses.includes('validation'),
    'propose must not await skipped validation',
  );
});

// ─── harness waiver: skipped review records waiver ────────────────────────────

test('Given pipeline.skip:[review], when resolvePipeline runs, then waivers includes a review waiver', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { skip: ['review'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const hasWaiver = result.waivers.some(w => w.phaseId === 'review');
  assert.ok(hasWaiver, 'waivers must record a review waiver when review is skipped');
});

// ─── harness waiver: skipped refactoring records waiver ─────────────────────

test('Given pipeline.skip:[refactoring], when resolvePipeline runs, then waivers includes a refactoring waiver', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { skip: ['refactoring'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const hasWaiver = result.waivers.some(w => w.phaseId === 'refactoring');
  assert.ok(hasWaiver, 'waivers must record a refactoring waiver when refactoring is skipped');
});
