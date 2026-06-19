/**
 * Scenario golden suite — S1..S9 + SC1 anchor.
 *
 * Each scenario runs resolvePipeline against a manifest fixture and asserts
 * specific slices of the Resolution. Gate/waiver assertions exercise the
 * gate-decision layer that this slice lands.
 *
 * S7 (namespaced registration) exercises the full extends.phases registration surface:
 * a registered phase lands in effective[], carries its bundle + gate, and flows through
 * the same graph/strand/gate discipline as default phases. S6 (backlog adapter) is
 * exercised end-to-end at the resolution layer.
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
import { HARNESS_ARCHETYPE } from '../src/profile.js';
import { CORE_MARKERS, hasCI } from '../test-helpers/contract-markers.js';

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
  refinement:     readBundle('refinement'),
};

// Real (shipping) contract bundles — the source contract-equivalence.test.js assembles
// against; carries the full core (incl. the swallowed-errors line the minimal fixture omits).
const REAL_FRAGMENTS = {
  core:           readFileSync(join(__dir, '..', '..', 'contracts', 'core.md'), 'utf8'),
  producer:       readFileSync(join(__dir, '..', '..', 'contracts', 'producer.md'), 'utf8'),
  construction:   readFileSync(join(__dir, '..', '..', 'contracts', 'construction.md'), 'utf8'),
  'harness-read': readFileSync(join(__dir, '..', '..', 'contracts', 'harness-read.md'), 'utf8'),
  'harness-exec': readFileSync(join(__dir, '..', '..', 'contracts', 'harness-exec.md'), 'utf8'),
  delivery:       readFileSync(join(__dir, '..', '..', 'contracts', 'delivery.md'), 'utf8'),
  refinement:     readFileSync(join(__dir, '..', '..', 'contracts', 'refinement.md'), 'utf8'),
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

  // Pin that report-producers are NOT code-producing (change ∈ produces is the predicate).
  // Regression guard: adding 'change' to a report-producer must break this test loudly.
  for (const id of ['review', 'validation']) {
    const decision = result.gateDecisions.find(g => g.phaseId === id);
    assert.ok(decision, `gateDecisions must have entry for ${id}`);
    assert.equal(decision.codeProducing, false, `${id} produces a report, not change — codeProducing must be false`);
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
  // validation is the only default-enabled executing-harness; review is a read-harness and must not appear
  assert.deepEqual(
    proposeDecision.awaitingHarnesses,
    ['validation'],
    'propose must await exactly validation (executing-harness); review (read-harness) must be excluded',
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

test('SC1 Given no manifest, when resolvePipeline runs, then record seeds exactly the two default-skip entries the walk consumes', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  // The orchestrator walk seeds its run record verbatim from this array (run/SKILL.md §0 1c);
  // pin the exact strings so the engine cannot drift the prefix/entries out from under the walk.
  assert.deepEqual(result.record, [
    'default-skip: requirements (descriptor enabled:false)',
    'default-skip: architecture (descriptor enabled:false)',
  ]);
});

test('SC1 Given no manifest, when resolvePipeline runs, then the per-phase gate strings the walk reads are pinned', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const gateOf = id => result.gateDecisions.find(g => g.phaseId === id)?.gate;
  // Walk step 5 branches on these exact strings (empty = no gate; placeholder = resolved at gate time).
  assert.equal(gateOf('planning'), 'plan-lint');
  assert.equal(gateOf('implementation'), '<gates.phase>');
  assert.equal(gateOf('review'), '<gates.phase>');
  assert.equal(gateOf('refactoring'), '<gates.phase>');
  assert.equal(gateOf('validation'), '<validation gate>');
  assert.equal(gateOf('propose'), 'pr.pre-pr-gate');
  assert.equal(gateOf('workspace'), '');
  assert.equal(gateOf('documentation'), '');
});

// ─── S1: profile:solo ────────────────────────────────────────────────────────

test('S1 Given profile:solo manifest, when resolvePipeline runs, then non-harness phases run inline', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S1');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const harnessIds = new Set(result.effective.filter(d => d.archetype === HARNESS_ARCHETYPE).map(d => d.id));
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
  assert.equal(planning.id, 'planning', 'the swap changes role, never id');
});

test('S2 Given phases.planning.role swapped, when assembleContract runs on planning descriptor, then EVERY core marker and the producer bundle survive', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S2');
  const resolveResult = resolvePipeline(defaults, manifest);
  assert.equal(resolveResult.ok, true);

  const planningDescriptor = resolveResult.effective.find(d => d.id === 'planning');
  assert.ok(planningDescriptor, 'planning must be in effective pipeline');
  const sut = assembleContract;

  const result = sut(planningDescriptor, manifest, REAL_FRAGMENTS, {});

  for (const marker of CORE_MARKERS) {
    assert.ok(hasCI(result, marker), `swap dropped core marker: "${marker}"`);
  }
  assert.ok(hasCI(result, 'Decision-candidates section is mandatory'), 'producer bundle must survive the swap');
});

// ─── S2-proc: default-phase procedure override lands on the descriptor ────────

test('S2-proc Given phases.planning.procedure:acme:my-planner, when resolvePipeline runs, then effective planning carries that procedure with id unchanged', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S2-procedure');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
  const planning = result.effective.find(d => d.id === 'planning');
  assert.ok(planning, 'planning must be in effective pipeline');
  assert.equal(planning.procedure, 'acme:my-planner', 'planning procedure must be overridden');
  assert.equal(planning.id, 'planning', 'the override changes procedure, never id');
});

// ─── S2-neg: swap to a non-existent role fails closed at resolution ───────────

test('S2-neg Given phases.planning.role:my:does-not-exist and a roleExists probe that rejects it, when resolvePipeline runs, then ok:false naming the phase and the ref', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S2-bad-role');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest, { roleExists: ref => ref !== 'my:does-not-exist' });

  assert.equal(result.ok, false, 'a swap to an unresolved role must fail closed');
  assert.ok(
    result.errors.some(e => e.includes('planning') && e.includes('my:does-not-exist')),
    `errors must name the phase and the unresolved ref; got: ${JSON.stringify(result.errors)}`,
  );
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

// ─── S6: backlog declared — record names the active adapter ──────────────────

test('S6 Given backlog { source: file } declared in manifest, when resolvePipeline runs, then record names the active source "file" and matches /backlog/i', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S6');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const backlogLine = result.record.find(r => r.includes('file'));
  assert.ok(backlogLine, 'record must contain a line naming the active source "file"');
  assert.ok(/backlog/i.test(backlogLine), 'the source-naming line must still match /backlog/i');
});

// ─── S7: namespaced acme:bench registered phase (extends block) ───────────────

test('S7 Given extends.phases acme:bench, when resolvePipeline runs, then acme:bench is in effective pipeline with its contract bundle', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S7');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);

  const ids = result.effective.map(d => d.id);
  assert.ok(ids.includes('acme:bench'), 'acme:bench must be accepted in effective pipeline');

  const bench = result.effective.find(d => d.id === 'acme:bench');
  assert.ok(bench, 'acme:bench descriptor must be present');
  assert.deepEqual(bench.contract, ['harness-exec'], 'acme:bench must carry harness-exec contract bundle');
  assert.equal(bench.procedure, 'acme:bench', 'acme:bench must carry its namespaced procedure');
  assert.equal(bench.role, 'acme:bench-runner', 'acme:bench must carry its namespaced role');
});

test('S7 Given extends.phases acme:bench with gate, when resolvePipeline runs, then gateDecisions includes acme:bench with gate', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S7');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);

  const decision = result.gateDecisions.find(g => g.phaseId === 'acme:bench');
  assert.ok(decision, 'gateDecisions must include acme:bench');
  assert.ok(decision.gate, 'acme:bench must have a resolved gate');
});

test('S7 Given extends.phases acme:bench, when resolvePipeline runs, then acme:bench appears after validation in effective', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S7');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);

  const ids = result.effective.map(d => d.id);
  const validationIdx = ids.indexOf('validation');
  const benchIdx = ids.indexOf('acme:bench');
  assert.ok(benchIdx > validationIdx, 'acme:bench must appear after validation');
});

// ─── S7: registered profile acme-full selectable via pipeline.profile ────────

test('S7 Given extends.profiles.acme-full and pipeline.profile:acme-full, when resolvePipeline runs, then ok:true and construction phase resolves to profile map value', () => {
  const defaults = loadDefault();
  const manifest = {
    ...loadScenarioManifest('S7'),
    pipeline: { profile: 'acme-full' },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);
  const constructionPhase = result.effective.find(d => d.archetype === 'construction');
  assert.ok(constructionPhase, 'a construction-archetype phase must be present');
  assert.equal(constructionPhase.execution, 'agent', 'construction must resolve to acme-full map value: agent');
  const setupPhase = result.effective.find(d => d.archetype === 'setup');
  assert.ok(setupPhase, 'a setup-archetype phase must be present');
  assert.equal(setupPhase.execution, 'inline', 'setup must resolve to acme-full map value: inline');
});

test('S7 Given extends.profiles.acme-full selected via pipeline.profile, when resolvePipeline runs, then harness-archetype phases stay agent (floor enforced)', () => {
  const defaults = loadDefault();
  const manifest = {
    ...loadScenarioManifest('S7'),
    pipeline: { profile: 'acme-full' },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);
  const harnessPhases = result.effective.filter(d => d.archetype === 'harness');
  assert.ok(harnessPhases.length > 0, 'harness-archetype phases must be present');
  for (const phase of harnessPhases) {
    assert.equal(phase.execution, 'agent', `harness phase "${phase.id}" must be forced to agent regardless of acme-full profile map`);
  }
});

// ─── S7: registered backlog adapter selected as backlog.source ───────────────

test('S7 Given extends.backlog-adapters acme-tracker selected as backlog.source, when resolvePipeline runs, then record names the adapter and its ref', () => {
  const defaults = loadDefault();
  const manifest = {
    ...loadScenarioManifest('S7'),
    backlog: { source: 'acme-tracker', ref: '.claude/workflow/acme-backlog.sh' },
  };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors?.join('; ')}`);

  const backlogLine = result.record.find(r => r.includes('acme-tracker'));
  assert.ok(backlogLine, 'record must contain a line naming the adapter "acme-tracker"');
  assert.ok(backlogLine.includes('.claude/workflow/acme-backlog.sh'), 'record line must include the adapter ref');
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

// ─── S9: retrieval note — unconditional engine injection ─────────────────────
// The engine calls deriveRetrievalNote() unconditionally inside assembleContract;
// it does NOT read manifest.retrieval to decide whether to inject.
// Manifest-driven *strategy derivation* is a later-phase concern.

test('S9 Given retrieval declared in manifest, when assembleContract runs, then engine-injected retrieval note is present', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S9');
  const resolveResult = resolvePipeline(defaults, manifest);
  assert.equal(resolveResult.ok, true);

  const designDescriptor = resolveResult.effective.find(d => d.id === 'design');
  assert.ok(designDescriptor, 'design must be in effective pipeline');

  const sut = assembleContract;

  const result = sut(designDescriptor, manifest, FRAGMENTS, {});

  assert.ok(result.includes('retrieval'), 'engine-injected retrieval note must be present');
});

test('S9 Given an EMPTY manifest (no retrieval key), when assembleContract runs, then engine still injects the retrieval note', () => {
  // Proves the note is unconditionally engine-injected — not manifest- or fixture-sourced.
  const defaults = loadDefault();
  const resolveResult = resolvePipeline(defaults, {});
  assert.equal(resolveResult.ok, true);

  const designDescriptor = resolveResult.effective.find(d => d.id === 'design');
  assert.ok(designDescriptor, 'design must be in effective pipeline');

  const sut = assembleContract;

  // Empty manifest — no retrieval key present
  const result = sut(designDescriptor, {}, FRAGMENTS, {});

  assert.ok(result.includes('retrieval'), 'retrieval note must be present even with empty manifest — engine injects unconditionally');
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
    '  procedure: craft:workspace',
    '  produces: [workspace]',
    '- id: implementation',
    '  archetype: construction',
    '  contract: [construction]',
    '  procedure: craft:implementation',
    '  role: craft:slice-implementer',
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

test('Given pipeline.skip:[validation], when resolvePipeline runs, then waivers includes a validation waiver with proposeGateReleased:true', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { skip: ['validation'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const waiver = result.waivers.find(w => w.phaseId === 'validation');
  assert.ok(waiver, 'waivers must record a validation waiver when validation is skipped');
  // validation is an executing-harness: skipping it releases its propose-gate
  assert.equal(waiver.proposeGateReleased, true, 'validation waiver must have proposeGateReleased:true (executing-harness)');
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

test('Given pipeline.skip:[review], when resolvePipeline runs, then waivers includes a review waiver with proposeGateReleased:false', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { skip: ['review'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const waiver = result.waivers.find(w => w.phaseId === 'review');
  assert.ok(waiver, 'waivers must record a review waiver when review is skipped');
  // review is a read-harness: skipping it does NOT release a propose-gate
  assert.equal(waiver.proposeGateReleased, false, 'review waiver must have proposeGateReleased:false (read-harness)');
});

// ─── harness waiver: skipped refactoring records waiver ─────────────────────

test('Given pipeline.skip:[refactoring], when resolvePipeline runs, then waivers includes a refactoring waiver with proposeGateReleased:false', () => {
  const defaults = loadDefault();
  const manifest = { pipeline: { skip: ['refactoring'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const waiver = result.waivers.find(w => w.phaseId === 'refactoring');
  assert.ok(waiver, 'waivers must record a refactoring waiver when refactoring is skipped');
  // refactoring is a refinement phase, not an executing-harness: proposeGateReleased must be false
  assert.equal(waiver.proposeGateReleased, false, 'refactoring waiver must have proposeGateReleased:false (refinement, not executing-harness)');
});

// ─── harness waiver: skipped architecture releases propose-gate ───────────────

test('Given architecture enabled then skipped, when resolvePipeline runs, then architecture waiver has proposeGateReleased:true and record mentions architecture + propose', () => {
  const defaults = loadDefault();
  // architecture is disabled by default; enable it so the skip can waive it as an executing-harness
  const manifest = { phases: { architecture: { enabled: true } }, pipeline: { skip: ['architecture'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const waiver = result.waivers.find(w => w.phaseId === 'architecture');
  assert.ok(waiver, 'waivers must record an architecture waiver when architecture is enabled then skipped');
  // architecture is an executing-harness: skipping it releases its propose-gate
  assert.equal(waiver.proposeGateReleased, true, 'architecture waiver must have proposeGateReleased:true (executing-harness)');

  const hasReleaseRecord = result.record.some(r =>
    r.toLowerCase().includes('architecture') && r.toLowerCase().includes('propose'),
  );
  assert.ok(hasReleaseRecord, `record must include a loud propose-gate release line for architecture; got: ${JSON.stringify(result.record)}`);
});

// ─── S-lean: profile:lean per-archetype expansion ────────────────────────────

test('S-lean Given profile:lean manifest, when resolvePipeline runs, then setup archetype phases run inline', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-lean');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const setupPhases = result.effective.filter(d => d.archetype === 'setup');
  assert.ok(setupPhases.length > 0, 'must have at least one setup-archetype phase');
  for (const d of setupPhases) {
    assert.equal(d.execution, 'inline', `setup phase ${d.id} must be inline under lean profile`);
  }
});

test('S-lean Given profile:lean manifest, when resolvePipeline runs, then specification archetype phases run inline', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-lean');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const specPhases = result.effective.filter(d => d.archetype === 'specification');
  assert.ok(specPhases.length > 0, 'must have at least one specification-archetype phase');
  for (const d of specPhases) {
    assert.equal(d.execution, 'inline', `specification phase ${d.id} must be inline under lean profile`);
  }
});

test('S-lean Given profile:lean manifest, when resolvePipeline runs, then delivery archetype phases run inline', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-lean');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const deliveryPhases = result.effective.filter(d => d.archetype === 'delivery');
  assert.ok(deliveryPhases.length > 0, 'must have at least one delivery-archetype phase');
  for (const d of deliveryPhases) {
    assert.equal(d.execution, 'inline', `delivery phase ${d.id} must be inline under lean profile`);
  }
});

test('S-lean Given profile:lean manifest, when resolvePipeline runs, then construction archetype phases run agent', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-lean');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const constructionPhases = result.effective.filter(d => d.archetype === 'construction');
  assert.ok(constructionPhases.length > 0, 'must have at least one construction-archetype phase');
  for (const d of constructionPhases) {
    assert.equal(d.execution, 'agent', `construction phase ${d.id} must be agent under lean profile`);
  }
});

test('S-lean Given profile:lean manifest, when resolvePipeline runs, then refinement archetype phases run agent', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-lean');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const refinementPhases = result.effective.filter(d => d.archetype === 'refinement');
  assert.ok(refinementPhases.length > 0, 'must have at least one refinement-archetype phase');
  for (const d of refinementPhases) {
    assert.equal(d.execution, 'agent', `refinement phase ${d.id} must be agent under lean profile`);
  }
});

test('S-lean Given profile:lean manifest, when resolvePipeline runs, then harness archetype phases run agent', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-lean');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  const harnessPhases = result.effective.filter(d => d.archetype === HARNESS_ARCHETYPE);
  assert.ok(harnessPhases.length > 0, 'must have at least one harness-archetype phase');
  for (const d of harnessPhases) {
    assert.equal(d.execution, 'agent', `harness phase ${d.id} must be agent under lean profile`);
  }
});

test('S-lean Given profile:lean manifest, when resolvePipeline runs, then gateDecisions length equals effective length', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-lean');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.equal(result.gateDecisions.length, result.effective.length);
});

// ─── S-full: profile:full all agent ──────────────────────────────────────────

test('S-full Given profile:full manifest, when resolvePipeline runs, then every effective phase runs agent', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-full');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);

  for (const d of result.effective) {
    assert.equal(d.execution, 'agent', `phase ${d.id} must be agent under full profile`);
  }
});

test('S-full Given profile:full manifest, when resolvePipeline runs, then effective length equals 11 (matches SC1)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-full');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.equal(result.effective.length, SC1_IDS.length, 'S-full must produce the same phase count as SC1');
});

// ─── S-reorder: valid reorder alone ──────────────────────────────────────────

test('S-reorder Given reorder:[validation, review], when resolvePipeline runs, then ok:true with validation before review', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-reorder');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const ids = result.effective.map(d => d.id);
  assert.ok(ids.indexOf('validation') < ids.indexOf('review'),
    'validation must precede review after reorder');
});

// S-reorder swaps validation/review only; refactoring (enabled here — no skip) stays put
// between them, so the full order pins that non-reordered phases keep their positions.
const S_REORDER_IDS = [
  'workspace', 'design', 'decisions', 'planning', 'implementation',
  'validation', 'refactoring', 'review', 'documentation', 'propose', 'integrate',
];

test('S-reorder Given reorder:[validation, review], when resolvePipeline runs, then effective order matches the S-reorder golden (refactoring stays put)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-reorder');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), S_REORDER_IDS);
  assert.equal(result.effective.length, SC1_IDS.length, 'reorder preserves the full phase count — only order changes');
});

test('S-reorder Given reorder:[validation, review], when resolvePipeline runs, then record contains both reorder lines', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-reorder');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.ok(result.record.includes('reorder: validation (pipeline.reorder)'));
  assert.ok(result.record.includes('reorder: review (pipeline.reorder)'));
});

// ─── SC3: composed golden (skip + insert + reorder) ──────────────────────────

const SC3_EFFECTIVE_IDS = [
  'workspace', 'design', 'decisions', 'planning', 'implementation',
  'validation', 'review', 'bench', 'documentation', 'propose', 'integrate',
];

test('SC3 Given skip:refactoring + insert:bench after validation + reorder:[validation,review], when resolvePipeline runs, then ok:true', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `Expected ok but got errors: ${JSON.stringify(result.errors)}`);
});

test('SC3 Given composed edits, when resolvePipeline runs, then effective id order matches SC3 golden', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), SC3_EFFECTIVE_IDS);
});

test('SC3 Given composed edits, when resolvePipeline runs, then record includes all four pinned lines in order', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const rec = result.record;
  const skipIdx    = rec.indexOf('skip: refactoring (manifest pipeline.skip)');
  const insertIdx  = rec.indexOf('insert: bench (after:validation)');
  const reorder1Idx = rec.indexOf('reorder: validation (pipeline.reorder)');
  const reorder2Idx = rec.indexOf('reorder: review (pipeline.reorder)');
  assert.ok(skipIdx !== -1, 'record must include skip:refactoring line');
  assert.ok(insertIdx !== -1, 'record must include insert:bench line');
  assert.ok(reorder1Idx !== -1, 'record must include reorder:validation line');
  assert.ok(reorder2Idx !== -1, 'record must include reorder:review line');
  assert.ok(skipIdx < insertIdx, 'skip line must precede insert line');
  assert.ok(insertIdx < reorder1Idx, 'insert line must precede first reorder line');
  assert.ok(reorder1Idx < reorder2Idx, 'first reorder line must precede second');
});

test('SC3 Given composed edits, when resolvePipeline runs, then bench gateDecision has a non-empty gate', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const benchDecision = result.gateDecisions.find(g => g.phaseId === 'bench');
  assert.ok(benchDecision, 'gateDecisions must include bench');
  assert.equal(benchDecision.gate, 'node --test engine/test/bench.test.js',
    'bench gate must be the exact string from the insert descriptor (walk contract)');
});

test('SC3 Given composed edits, when resolvePipeline runs, then propose awaits validation and bench but not review', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const proposeDecision = result.gateDecisions.find(g => g.phaseId === 'propose');
  assert.ok(proposeDecision, 'propose must have a gateDecision');
  // Exactly the two harness-exec phases, in effective order — review (harness-read) excluded,
  // no spurious entries. deepEqual pins the complete set, not just membership.
  assert.deepEqual(proposeDecision.awaitingHarnesses, ['validation', 'bench']);
});

test('SC3 Given composed edits, when resolvePipeline runs, then refactoring has no gateDecision entry (skipped)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('SC3');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const refactoringDecision = result.gateDecisions.find(g => g.phaseId === 'refactoring');
  assert.ok(!refactoringDecision, 'refactoring must have no gateDecision (it is skipped)');
});

// ─── reorder-refused negative: consumer before producer ───────────────────────

test('Given reorder puts validation before implementation (consumer before producer), when resolvePipeline runs, then ok:false with a graph error mentioning validation and change', () => {
  const defaults = loadDefault();
  // reorder: [validation, implementation] — over the FULL descriptor list (incl. default-off
  // requirements/architecture), implementation is at index 5 and validation at index 8; slots [5,8]
  // refill to validation@5, implementation@8 → validation precedes its change producer
  const manifest = { pipeline: { reorder: ['validation', 'implementation'] } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, false);
  const hasGraphError = result.errors.some(e => e.includes('validation') && e.includes('change'));
  assert.ok(hasGraphError,
    `errors must mention the consumer-before-producer violation; got: ${JSON.stringify(result.errors)}`);
});

// ─── S-harness-review: partial harness override preserves default knobs ───────

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then ok:true', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then review descriptor has max_cycles:2 (override wins)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const reviewDesc = result.effective.find(d => d.id === 'review');
  assert.ok(reviewDesc, 'review must be in effective');
  assert.equal(reviewDesc.harness.max_cycles, 2);
});

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then the merged review harness keeps every unset default knob (override wins, defaults survive)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const reviewDesc = result.effective.find(d => d.id === 'review');
  // Pin the WHOLE merged block: max_cycles overridden to 2; dimensions/passes/convergence
  // all survive the one-level deep-merge.
  assert.deepEqual(reviewDesc.harness, {
    dimensions: ['code', 'security', 'tests', 'perf'],
    passes: 1,
    max_cycles: 2,
    convergence: 'low-only',
  });
});

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then effective ids equal SC1_IDS (no phase change)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS);
});

test('S-harness-review Given phases.review.harness: { max_cycles: 2 }, when resolvePipeline runs, then unrelated validation descriptor keeps harness.tool: stryker', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-review');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const validationDesc = result.effective.find(d => d.id === 'validation');
  // An unrelated review override must not corrupt validation's own harness block.
  assert.equal(validationDesc.harness.tool, 'stryker');
  assert.equal(validationDesc.harness.scope, 'per-hunk');
});

// ─── S-harness-validation: partial harness override preserves default tool ────

test('S-harness-validation Given phases.validation.harness: { scope: "per-file" }, when resolvePipeline runs, then ok:true', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-validation');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true, `expected ok but got: ${JSON.stringify(result.errors)}`);
});

test('S-harness-validation Given phases.validation.harness: { scope: "per-file" }, when resolvePipeline runs, then validation keeps harness.tool: stryker (default preserved)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-validation');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const validationDesc = result.effective.find(d => d.id === 'validation');
  assert.equal(validationDesc.harness.tool, 'stryker');
});

test('S-harness-validation Given phases.validation.harness: { scope: "per-file" }, when resolvePipeline runs, then validation.harness.scope is per-file (override wins)', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-validation');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  const validationDesc = result.effective.find(d => d.id === 'validation');
  assert.equal(validationDesc.harness.scope, 'per-file');
});

test('S-harness-validation Given phases.validation.harness: { scope: "per-file" }, when resolvePipeline runs, then effective ids equal SC1_IDS', () => {
  const defaults = loadDefault();
  const manifest = loadScenarioManifest('S-harness-validation');
  const sut = resolvePipeline;

  const result = sut(defaults, manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.effective.map(d => d.id), SC1_IDS);
});

// ─── ADV-1: roleExists filter true-branch count ───────────────────────────────

test('ADV-1 Given a manifest with two role-bearing phases and a probe rejecting only one, when resolvePipeline runs, then exactly one error names the bad phase', () => {
  const defaults = loadDefault();
  const manifest = { phases: { planning: { role: 'my:good' }, implementation: { role: 'my:bad' } } };
  const sut = resolvePipeline;

  const result = sut(defaults, manifest, { roleExists: ref => ref !== 'my:bad' });

  assert.equal(result.ok, false, 'a rejected role must fail closed');
  assert.equal(result.errors.length, 1, `expected exactly 1 error; got: ${JSON.stringify(result.errors)}`);
  assert.ok(
    result.errors[0].includes('implementation') && result.errors[0].includes('my:bad'),
    `error must name the bad phase and ref; got: ${result.errors[0]}`,
  );
});
