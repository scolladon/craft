import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parsePipeline } from '../src/descriptor.js';
import { validatePipeline } from '../src/graph.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dir, 'fixtures', 'pipeline');
const canonicalDefaultPath = join(__dir, '..', '..', 'pipeline', 'default.yml');

function readAndParse(name) {
  return parsePipeline(readFileSync(join(fixturesDir, name), 'utf8'));
}

function parseDefault() {
  return parsePipeline(readFileSync(canonicalDefaultPath, 'utf8'));
}

// --- default pipeline ---

test('Given default.yml, when validatePipeline runs, then ok is true with no errors', () => {
  const sut = parseDefault();
  const result = validatePipeline(sut);
  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors.join('; ')}`);
  assert.deepEqual(result.errors, []);
});

test('Given default.yml with requirements and architecture default-off, when validatePipeline runs, then self_supply exemption lets it pass', () => {
  // This is the key SC1 data anchor: disabled producers are absorbed by self_supply
  const sut = parseDefault();
  const reqOff = sut.find(d => d.id === 'requirements');
  const archOff = sut.find(d => d.id === 'architecture');
  assert.equal(reqOff.enabled, false);
  assert.equal(archOff.enabled, false);
  const result = validatePipeline(sut);
  assert.equal(result.ok, true);
});

// --- invalid fixtures ---

test('Given cycle.yml (a back-edge that cannot resolve to an earlier producer), when validatePipeline runs, then it reports the unresolved consume', () => {
  const sut = readAndParse('cycle.yml');
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  // phase-b consumes 'beta', whose only producer (phase-c) is later in the order.
  assert.ok(
    result.errors.some(e => /beta/.test(e) && /no enabled phase before it produces/.test(e)),
    `Expected an unresolved-consume error for 'beta', got: ${result.errors.join('; ')}`,
  );
});

test('Given dangling-consume.yml, when validatePipeline runs, then it reports the specific dangling artifact', () => {
  const sut = readAndParse('dangling-consume.yml');
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /widget/.test(e) && /no enabled phase before it produces/.test(e)),
    `Expected a dangling-consume error for 'widget', got: ${result.errors.join('; ')}`,
  );
});

test('Given disabled-producer-absorbed.yml, when validatePipeline runs, then ok is true', () => {
  const sut = readAndParse('disabled-producer-absorbed.yml');
  const result = validatePipeline(sut);
  assert.equal(result.ok, true, `Expected ok but got errors: ${result.errors.join('; ')}`);
});

test('Given selfsupply-not-subset.yml, when validatePipeline runs, then ok is false', () => {
  const sut = readAndParse('selfsupply-not-subset.yml');
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /self_supply/.test(e)));
});

// --- inline duplicate id ---

test('Given descriptors with duplicate ids, when validatePipeline runs, then ok is false', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
  produces: [workspace]
- id: workspace
  archetype: setup
  contract: []
  procedure: craft:workspace
  produces: [workspace]
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /duplicate/i.test(e) || /unique/i.test(e)));
});

// --- bundle vocab ---

test('Given a descriptor with an unknown bundle name in contract, when validatePipeline runs, then ok is false', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: [unknown-bundle]
  procedure: craft:workspace
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /bundle/i.test(e) || /contract/i.test(e) || /unknown-bundle/.test(e)));
});

test('Given descriptors with valid bundle names, when validatePipeline runs, then ok is true', () => {
  const yaml = `
- id: workspace
  archetype: setup
  contract: [core]
  procedure: craft:workspace
  produces: [workspace]
- id: planning
  archetype: specification
  contract: [producer]
  procedure: craft:planning
  consumes: [workspace]
  self_supply: []
  produces: [plan]
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, true, `Expected ok but got: ${result.errors.join('; ')}`);
});

test('Given a descriptor with contract:[refinement], when validatePipeline runs, then ok is true', () => {
  const yaml = `
- id: refactoring
  archetype: refinement
  contract: [refinement]
  procedure: craft:refactoring
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, true, `Expected ok but got: ${result.errors.join('; ')}`);
});

// --- enriched dangling-consume messages ---

test('Given cycle.yml (producer is later), when validatePipeline runs, then error annotates position and after consumer', () => {
  const sut = readAndParse('cycle.yml');
  const result = validatePipeline(sut);
  // phase-c is at index 2, after phase-b (the consumer) at index 1
  assert.ok(
    result.errors.some(e => /beta/.test(e) && /phase-c \(position 2, after "phase-b"\)/.test(e)),
    `Expected position/after annotation for 'beta', got: ${result.errors.join('; ')}`,
  );
});

test('Given cycle.yml (producer is later), when validatePipeline runs, then suggestion includes after: with nearest producer', () => {
  const sut = readAndParse('cycle.yml');
  const result = validatePipeline(sut);
  assert.ok(
    result.errors.some(e => /beta/.test(e) && /Did you mean after: phase-c/.test(e)),
    `Expected 'Did you mean after: phase-c' in error, got: ${result.errors.join('; ')}`,
  );
});

test('Given a disabled producer for consumed artifact, when validatePipeline runs, then error annotates disabled', () => {
  const yaml = `
- id: provider
  archetype: setup
  contract: []
  procedure: craft:workspace
  enabled: false
  produces: [thing]
- id: consumer
  archetype: construction
  contract: [construction]
  procedure: craft:implementation
  consumes: [thing]
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /thing/.test(e) && /provider \(disabled\)/.test(e)),
    `Expected disabled annotation for 'thing', got: ${result.errors.join('; ')}`,
  );
});

test('Given a disabled producer, when validatePipeline runs, then suggestion includes after: arm', () => {
  const yaml = `
- id: provider
  archetype: setup
  contract: []
  procedure: craft:workspace
  enabled: false
  produces: [thing]
- id: consumer
  archetype: construction
  contract: [construction]
  procedure: craft:implementation
  consumes: [thing]
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.ok(
    result.errors.some(e => /thing/.test(e) && /Did you mean after: provider/.test(e)),
    `Expected 'Did you mean after: provider' in error, got: ${result.errors.join('; ')}`,
  );
});

test('Given dangling-consume.yml (no producer anywhere), when validatePipeline runs, then error says nothing in this pipeline', () => {
  const sut = readAndParse('dangling-consume.yml');
  const result = validatePipeline(sut);
  assert.ok(
    result.errors.some(e => /widget/.test(e) && /nothing in this pipeline/.test(e)),
    `Expected 'nothing in this pipeline' for 'widget', got: ${result.errors.join('; ')}`,
  );
});

test('Given dangling-consume.yml (no producer anywhere), when validatePipeline runs, then suggestion omits after: arm', () => {
  const sut = readAndParse('dangling-consume.yml');
  const result = validatePipeline(sut);
  const widgetErrors = result.errors.filter(e => /widget/.test(e));
  assert.ok(widgetErrors.length > 0, 'Expected at least one widget error');
  assert.ok(
    widgetErrors.every(e => !/Did you mean after:/.test(e)),
    `Expected no 'after:' arm when no producers, got: ${widgetErrors.join('; ')}`,
  );
});

test('Given dangling-consume.yml (no producer anywhere), when validatePipeline runs, then suggestion shows only produces: arm', () => {
  const sut = readAndParse('dangling-consume.yml');
  const result = validatePipeline(sut);
  assert.ok(
    result.errors.some(e => /widget/.test(e) && /Did you mean produces:/.test(e)),
    `Expected 'Did you mean produces:' suggestion for 'widget', got: ${result.errors.join('; ')}`,
  );
});

// --- T2: two producers at different distances — nearest reduce comparator ---

test('Given two disabled producers of an artifact at different distances from the consumer, when validatePipeline runs, then the suggestion names the nearest producer', () => {
  // producer-a at index 0 (distance 2 from consumer at index 2)
  // filler     at index 1 (not relevant)
  // consumer   at index 2 (consumes 'widget')
  // producer-b at index 3 (distance 1 from consumer at index 2)  ← nearest
  // Both producers are disabled so neither satisfies the consumer; nearest = producer-b.
  const yaml = `
- id: producer-a
  archetype: harness
  contract: []
  procedure: craft:p
  enabled: false
  produces: [widget]
- id: filler
  archetype: harness
  contract: []
  procedure: craft:p
- id: consumer
  archetype: construction
  contract: [construction]
  procedure: craft:c
  consumes: [widget]
- id: producer-b
  archetype: harness
  contract: []
  procedure: craft:p
  enabled: false
  produces: [widget]
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /widget/.test(e) && /Did you mean after: producer-b/.test(e)),
    `Expected "Did you mean after: producer-b" (nearest producer), got: ${result.errors.join('; ')}`,
  );
  assert.ok(
    result.errors.every(e => !/Did you mean after: producer-a/.test(e)),
    `Expected producer-a (farther) NOT to be the suggestion, got: ${result.errors.join('; ')}`,
  );
});

// --- T3: nearest producer is FIRST in iteration order — kills true?p:best and best.index+i mutants ---

test('Given two disabled producers where the nearest is first in pipeline order, when validatePipeline runs, then the suggestion names the nearest (first-iterated) producer', () => {
  // filler-1   at index 0
  // filler-2   at index 1
  // producer-near at index 2 (distance 1 from consumer at index 3)  ← nearest, FIRST in producers array
  // consumer   at index 3 (consumes 'blip')
  // filler-3   at index 4
  // producer-far  at index 5 (distance 2 from consumer at index 3)  ← farther, LAST in producers array
  //
  // true?p:best mutant always returns the last element (producer-far) — test kills it.
  // best.index+i mutant: |2+3|=5 ≠ |2−3|=1, so it incorrectly favours producer-far — test kills it.
  const yaml = `
- id: filler-1
  archetype: harness
  contract: []
  procedure: craft:p
- id: filler-2
  archetype: harness
  contract: []
  procedure: craft:p
- id: producer-near
  archetype: harness
  contract: []
  procedure: craft:p
  enabled: false
  produces: [blip]
- id: consumer
  archetype: construction
  contract: [construction]
  procedure: craft:c
  consumes: [blip]
- id: filler-3
  archetype: harness
  contract: []
  procedure: craft:p
- id: producer-far
  archetype: harness
  contract: []
  procedure: craft:p
  enabled: false
  produces: [blip]
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /blip/.test(e) && /Did you mean after: producer-near/.test(e)),
    `Expected "Did you mean after: producer-near" (nearest, first-iterated), got: ${result.errors.join('; ')}`,
  );
  assert.ok(
    result.errors.every(e => !/Did you mean after: producer-far/.test(e)),
    `Expected producer-far (farther, last-iterated) NOT to be the suggestion, got: ${result.errors.join('; ')}`,
  );
});

// --- T4: equidistant producers — kills the < → <= mutant (tie-break: first-seen wins) ---

test('Given two equidistant disabled producers, when validatePipeline runs, then the suggestion names the first-seen producer (< tie-break)', () => {
  // producer-x at index 1 (distance 2 from consumer at index 3)  ← first in producers array
  // consumer   at index 3 (consumes 'gizmo')
  // producer-y at index 5 (distance 2 from consumer at index 3)  ← second in producers array
  //
  // With <  : 2 < 2 is false → producer-x (first-seen) wins.
  // With <= : 2 <= 2 is true → producer-y (last-seen) would win — test kills it.
  const yaml = `
- id: filler-1
  archetype: harness
  contract: []
  procedure: craft:p
- id: producer-x
  archetype: harness
  contract: []
  procedure: craft:p
  enabled: false
  produces: [gizmo]
- id: filler-2
  archetype: harness
  contract: []
  procedure: craft:p
- id: consumer
  archetype: construction
  contract: [construction]
  procedure: craft:c
  consumes: [gizmo]
- id: filler-3
  archetype: harness
  contract: []
  procedure: craft:p
- id: producer-y
  archetype: harness
  contract: []
  procedure: craft:p
  enabled: false
  produces: [gizmo]
`;
  const sut = parsePipeline(yaml);
  const result = validatePipeline(sut);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(e => /gizmo/.test(e) && /Did you mean after: producer-x/.test(e)),
    `Expected "Did you mean after: producer-x" (first-seen wins tie), got: ${result.errors.join('; ')}`,
  );
  assert.ok(
    result.errors.every(e => !/Did you mean after: producer-y/.test(e)),
    `Expected producer-y (equidistant but later-iterated) NOT to be the suggestion, got: ${result.errors.join('; ')}`,
  );
});
