import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferArchetype, inferMissingArchetypes } from '../src/archetype.js';

// --- inferArchetype: rule table ---

test('Given a descriptor with a harness block and non-empty produces, when inferArchetype runs, then rule 1 wins and returns harness with reason "has harness block"', () => {
  const descriptor = { id: 'p', harness: { run: 'lint' }, produces: ['x'] };

  const sut = inferArchetype(descriptor);

  assert.deepEqual(sut, { archetype: 'harness', reason: 'has harness block' });
});

test('Given a descriptor with gate and empty produces, when inferArchetype runs, then rule 2 wins and returns harness with reason "gate with no produces"', () => {
  const descriptor = { id: 'p', gate: 'build', produces: [] };

  const sut = inferArchetype(descriptor);

  assert.deepEqual(sut, { archetype: 'harness', reason: 'gate with no produces' });
});

test('Given a descriptor with gate and non-empty produces, when inferArchetype runs, then rule 3 wins and returns construction', () => {
  const descriptor = { id: 'p', gate: 'build', produces: ['x'] };

  const sut = inferArchetype(descriptor);

  assert.deepEqual(sut, { archetype: 'construction', reason: 'produces [x]' });
});

test('Given a descriptor with multi-element produces and no gate, when inferArchetype runs, then rule 3 returns construction with joined reason', () => {
  const descriptor = { id: 'p', produces: ['a', 'b'] };

  const sut = inferArchetype(descriptor);

  assert.deepEqual(sut, { archetype: 'construction', reason: 'produces [a, b]' });
});

test('Given an empty descriptor with only id, when inferArchetype runs, then rule 4 returns harness with reason "fallback — most isolated"', () => {
  const descriptor = { id: 'p' };

  const sut = inferArchetype(descriptor);

  assert.deepEqual(sut, { archetype: 'harness', reason: 'fallback — most isolated' });
});

// --- inferArchetype: totality property ---

test('Given a matrix of descriptor shapes, when inferArchetype runs, then archetype is always harness or construction and reason is always a non-empty string', () => {
  const shapes = [
    { id: 'a' },
    { id: 'b', produces: [] },
    { id: 'c', produces: ['x'] },
    { id: 'd', gate: 'g' },
    { id: 'e', gate: 'g', produces: [] },
    { id: 'f', gate: 'g', produces: ['y'] },
    { id: 'g', harness: {} },
    { id: 'h', harness: {}, produces: ['z'] },
    { id: 'i', harness: {}, gate: 'g', produces: ['w'] },
  ];
  const validArchetypes = new Set(['harness', 'construction']);

  for (const descriptor of shapes) {
    const sut = inferArchetype(descriptor);
    assert.ok(validArchetypes.has(sut.archetype), `Expected archetype in {harness,construction}, got: ${sut.archetype} for ${JSON.stringify(descriptor)}`);
    assert.ok(typeof sut.reason === 'string' && sut.reason.length > 0, `Expected non-empty reason string for ${JSON.stringify(descriptor)}`);
  }
});

// --- inferMissingArchetypes ---

test('Given a list with one descriptor missing archetype and one with explicit construction, when inferMissingArchetypes runs, then only the missing one is filled and exactly one record is emitted', () => {
  const descriptors = [
    { id: 'missing' },
    { id: 'explicit', archetype: 'construction' },
  ];

  const sut = inferMissingArchetypes(descriptors);

  assert.equal(sut.descriptors.length, 2);
  assert.equal(sut.descriptors[0].archetype, 'harness');
  assert.equal(sut.descriptors[1].archetype, 'construction');
  assert.equal(sut.records.length, 1);
  assert.equal(sut.records[0], 'archetype: missing → harness (inferred: fallback — most isolated)');
});

test('Given a list where the missing descriptor uses rule 1, when inferMissingArchetypes runs, then record embeds the correct reason string', () => {
  const descriptors = [{ id: 'ph', harness: { run: 'x' } }];

  const sut = inferMissingArchetypes(descriptors);

  assert.equal(sut.records[0], 'archetype: ph → harness (inferred: has harness block)');
});

test('Given a list of descriptors all with explicit archetypes, when inferMissingArchetypes runs, then descriptors are passed through unchanged and records is empty', () => {
  const descriptors = [
    { id: 'a', archetype: 'harness' },
    { id: 'b', archetype: 'construction' },
  ];

  const sut = inferMissingArchetypes(descriptors);

  assert.deepEqual(sut.descriptors, descriptors);
  assert.deepEqual(sut.records, []);
});

// --- immutability ---

test('Given a descriptor without archetype, when inferMissingArchetypes runs, then the original input descriptor object is not mutated', () => {
  const original = { id: 'p' };
  const descriptors = [original];

  inferMissingArchetypes(descriptors);

  assert.equal(original.archetype, undefined);
});

// --- T5: non-array produces value ---

test('Given a descriptor where produces is a string (non-array), when inferArchetype runs, then it is treated as empty and returns harness via fallback', () => {
  const descriptor = { id: 'p', produces: 'not-an-array' };

  const sut = inferArchetype(descriptor);

  assert.equal(sut.archetype, 'harness', `Expected harness when produces is non-array, got: ${sut.archetype}`);
});

test('Given a descriptor where produces is a string and gate is set, when inferMissingArchetypes runs, then it is treated as no produces and infers harness', () => {
  const descriptors = [{ id: 'p', gate: 'make test', produces: 'artifact' }];

  const sut = inferMissingArchetypes(descriptors);

  assert.equal(sut.descriptors[0].archetype, 'harness', `Expected harness when produces is non-array string, got: ${sut.descriptors[0].archetype}`);
});
