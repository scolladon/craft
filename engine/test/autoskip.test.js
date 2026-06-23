import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parsePipeline } from '../src/descriptor.js';
import { checkStrandedConsumers } from '../src/strand.js';
import { computeAutoSkipEligibility, FLOOR_PHASES } from '../src/autoskip.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const defaultYml = join(__dir, '..', '..', 'pipeline', 'default.yml');

function loadDefault() {
  return parsePipeline(readFileSync(defaultYml, 'utf8'));
}

// 1. Given floor phase, computeAutoSkipEligibility runs, false
test('Given floor phase, computeAutoSkipEligibility runs, false', () => {
  const defaults = loadDefault();
  const effective = defaults.filter(d => d.enabled !== false);

  for (const id of ['workspace', 'implementation', 'propose', 'integrate']) {
    const descriptor = effective.find(d => d.id === id);
    const result = computeAutoSkipEligibility(descriptor, null, effective, defaults);
    assert.equal(result, false, `floor phase "${id}" must return false`);
  }
});

// 1b. Floor clause is independently load-bearing: a floor phase that is strand-clean
// (produces nothing, so removing it strands no consumer) and not required must STILL be
// ineligible — proving the floor check, not incidental strand overlap, is what excludes it.
test('Given a strand-clean floor phase, computeAutoSkipEligibility runs, false via the floor clause', () => {
  for (const id of ['workspace', 'implementation', 'propose', 'integrate']) {
    const floorPhase = { id, enabled: true, consumes: [], self_supply: [], produces: [] };
    const effective = [floorPhase];

    const result = computeAutoSkipEligibility(floorPhase, null, effective, effective);

    assert.equal(result, false, `strand-clean floor phase "${id}" must still be false via the floor clause`);
  }
});

// 2. Given FLOOR_PHASES frozen Set exported, it is immutable
test('Given FLOOR_PHASES frozen Set exported, it is immutable', () => {
  assert.ok(FLOOR_PHASES instanceof Set);
  assert.ok(Object.isFrozen(FLOOR_PHASES));
  assert.equal(FLOOR_PHASES.has('workspace'), true);
  assert.equal(FLOOR_PHASES.has('implementation'), true);
  assert.equal(FLOOR_PHASES.has('propose'), true);
  assert.equal(FLOOR_PHASES.has('integrate'), true);
  assert.equal(FLOOR_PHASES.size, 4);
});

// 3. Given strand-blocking phases design/planning, computeAutoSkipEligibility runs, false
// (decisions self-supplied by planning — strand-clean — is covered by eligible set tests)
test('Given strand-blocking phases design/planning, computeAutoSkipEligibility runs, false', () => {
  const defaults = loadDefault();
  const effective = defaults.filter(d => d.enabled !== false);

  for (const id of ['design', 'planning']) {
    const descriptor = effective.find(d => d.id === id);
    const result = computeAutoSkipEligibility(descriptor, null, effective, defaults);
    assert.equal(result, false, `strand-blocking phase "${id}" must return false`);
  }
});

// 4. Given refactoring (strand-clean re-producer), computeAutoSkipEligibility runs, true
// refactoring re-produces `change` but `implementation` is an earlier alternative producer,
// so it is strand-clean and not excluded by any code-producing rule.
test('Given refactoring strand-clean re-producer, computeAutoSkipEligibility runs, true', () => {
  const defaults = loadDefault();
  const effective = defaults.filter(d => d.enabled !== false);
  const descriptor = effective.find(d => d.id === 'refactoring');
  const result = computeAutoSkipEligibility(descriptor, null, effective, defaults);
  assert.equal(result, true);
});

// 5. Given strand-clean eligible set review/documentation/validation, runs over default effective, true
test('Given strand-clean eligible set review/documentation/validation, computeAutoSkipEligibility runs, true', () => {
  const defaults = loadDefault();
  const effective = defaults.filter(d => d.enabled !== false);

  for (const id of ['review', 'documentation', 'validation']) {
    const descriptor = effective.find(d => d.id === id);
    const result = computeAutoSkipEligibility(descriptor, null, effective, defaults);
    assert.equal(result, true, `eligible phase "${id}" must return true`);
  }
});

// 6. Given architecture enabled in effective list, it runs, true
test('Given architecture enabled in effective list, computeAutoSkipEligibility runs, true', () => {
  const defaults = loadDefault();
  // Toggle architecture to enabled in the effective list
  const effective = defaults
    .filter(d => d.enabled !== false || d.id === 'architecture')
    .map(d => d.id === 'architecture' ? { ...d, enabled: true } : d);
  const descriptor = effective.find(d => d.id === 'architecture');
  const result = computeAutoSkipEligibility(descriptor, null, effective, defaults);
  assert.equal(result, true);
});

// 7. Given otherwise-eligible phase pinned required:true, it runs, false
test('Given otherwise-eligible phase pinned required:true, computeAutoSkipEligibility runs, false', () => {
  const defaults = loadDefault();
  const effective = defaults.filter(d => d.enabled !== false);
  const descriptor = effective.find(d => d.id === 'review');
  const manifest = { phases: { review: { required: true } } };
  const result = computeAutoSkipEligibility(descriptor, manifest, effective, defaults);
  assert.equal(result, false);
});

// 8. Given phase auto-skip would strand consumer, it runs, false
test('Given phase auto-skip would strand consumer, computeAutoSkipEligibility runs, false', () => {
  // Build minimal fixture: producer p produces artifact 'x', consumer c consumes 'x' without self_supply
  const producer = { id: 'p', enabled: true, consumes: [], self_supply: [], produces: ['x'] };
  const consumer = { id: 'c', enabled: true, consumes: ['x'], self_supply: [], produces: [] };
  const effective = [producer, consumer];
  const defaults = [producer, consumer];

  const result = computeAutoSkipEligibility(producer, null, effective, defaults);
  assert.equal(result, false);
});

// 9. Strand-reuse property: phases marked eligible have empty checkStrandedConsumers result
test('Given eligible phases over default effective, strand-reuse property holds', () => {
  const defaults = loadDefault();
  const effective = defaults.filter(d => d.enabled !== false);

  for (const id of ['review', 'documentation', 'validation', 'refactoring', 'decisions']) {
    const descriptor = effective.find(d => d.id === id);
    const eligible = computeAutoSkipEligibility(descriptor, null, effective, defaults);
    assert.equal(eligible, true, `${id} should be eligible`);
    // Same call shape as resolve.js:286
    const strandings = checkStrandedConsumers(defaults, new Set([id]), effective);
    assert.equal(strandings.length, 0, `${id} must have no strandings when eligible`);
  }
});
