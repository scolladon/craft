import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReorder, checkReorderApplicability } from '../src/edits.js';

function makeDescriptor(id, enabled = true) {
  return { id, enabled, contract: [], consumes: [], produces: [], self_supply: [] };
}

// ─── Group A: checkReorderApplicability ──────────────────────────────────────

test('Given an applicable reorder list, when checkReorderApplicability runs, then it returns []', () => {
  const sut = checkReorderApplicability;
  const descriptors = [makeDescriptor('review'), makeDescriptor('validation')];

  const result = sut(descriptors, ['validation', 'review']);

  assert.deepEqual(result, []);
});

test('Given a reorder list with an unknown id, when checkReorderApplicability runs, then it returns exactly the unknown-id message', () => {
  const sut = checkReorderApplicability;
  const descriptors = [makeDescriptor('review')];

  const result = sut(descriptors, ['ghost']);

  assert.equal(result.length, 1);
  assert.ok(result.some(e => e.includes('"ghost"') && e.includes('not present')));
});

test('Given a reorder list with a non-enabled id, when checkReorderApplicability runs, then it returns exactly the non-enabled message', () => {
  const sut = checkReorderApplicability;
  const descriptors = [makeDescriptor('review'), makeDescriptor('refactoring', false)];

  const result = sut(descriptors, ['refactoring']);

  assert.equal(result.length, 1);
  assert.ok(result.some(e => e.includes('"refactoring"') && e.includes('not enabled')));
});

test('Given a reorder list with a duplicate id, when checkReorderApplicability runs, then it returns exactly the duplicate message', () => {
  const sut = checkReorderApplicability;
  const descriptors = [makeDescriptor('review')];

  const result = sut(descriptors, ['review', 'review']);

  assert.equal(result.length, 1);
  assert.ok(result.some(e => e.includes('"review"') && e.includes('duplicate')));
});

test('Given a list with multiple distinct problems, when checkReorderApplicability runs, then it accumulates ALL errors (no short-circuit)', () => {
  const sut = checkReorderApplicability;
  const descriptors = [makeDescriptor('review'), makeDescriptor('refactoring', false)];

  // unknown id, non-enabled id, duplicate
  const result = sut(descriptors, ['ghost', 'refactoring', 'review', 'review']);

  assert.equal(result.length, 3);
  assert.ok(result.some(e => e.includes('"ghost"') && e.includes('not present')));
  assert.ok(result.some(e => e.includes('"refactoring"') && e.includes('not enabled')));
  assert.ok(result.some(e => e.includes('"review"') && e.includes('duplicate')));
});

test('Given an empty reorder list, when checkReorderApplicability runs, then it returns [] (no-op symmetry with applyReorder)', () => {
  const sut = checkReorderApplicability;
  const descriptors = [makeDescriptor('review'), makeDescriptor('validation')];

  const result = sut(descriptors, []);

  assert.deepEqual(result, []);
});

// ─── Group B: applyReorder ───────────────────────────────────────────────────

test('Given a valid reorder list, when applyReorder runs, then slots are permuted and record lines emitted', () => {
  const sut = applyReorder;
  const descriptors = [makeDescriptor('review'), makeDescriptor('validation')];

  const result = sut(descriptors, ['validation', 'review']);

  assert.equal(result.descriptors[0].id, 'validation');
  assert.equal(result.descriptors[1].id, 'review');
  assert.deepEqual(result.records, [
    'reorder: validation (pipeline.reorder)',
    'reorder: review (pipeline.reorder)',
  ]);
});

test('Given an empty reorder list, when applyReorder runs, then descriptors unchanged and records empty', () => {
  const sut = applyReorder;
  const descriptors = [makeDescriptor('review'), makeDescriptor('validation')];

  const result = sut(descriptors, []);

  assert.deepEqual(result.descriptors, descriptors);
  assert.deepEqual(result.records, []);
});

test('Given a reorder list referencing an inserted phase id, when applyReorder runs, then it succeeds with correct order and records', () => {
  const sut = applyReorder;
  const descriptors = [makeDescriptor('validation'), makeDescriptor('bench'), makeDescriptor('documentation')];

  const result = sut(descriptors, ['bench', 'validation']);

  assert.equal(result.descriptors[0].id, 'bench');
  assert.equal(result.descriptors[1].id, 'validation');
  assert.equal(result.descriptors[2].id, 'documentation');
  assert.deepEqual(result.records, [
    'reorder: bench (pipeline.reorder)',
    'reorder: validation (pipeline.reorder)',
  ]);
});

test('Given a full-reverse reorder of every id, when applyReorder runs, then all slots refill in reverse and records cover every id', () => {
  const sut = applyReorder;
  const descriptors = [makeDescriptor('a'), makeDescriptor('b'), makeDescriptor('c')];

  const result = sut(descriptors, ['c', 'b', 'a']);

  assert.deepEqual(result.descriptors.map(d => d.id), ['c', 'b', 'a']);
  assert.deepEqual(result.records, [
    'reorder: c (pipeline.reorder)',
    'reorder: b (pipeline.reorder)',
    'reorder: a (pipeline.reorder)',
  ]);
});

test('Given any input, when applyReorder runs, then neither the input array nor its descriptor objects are mutated (immutability)', () => {
  const sut = applyReorder;
  const original = [makeDescriptor('review'), makeDescriptor('validation')];
  const originalIds = original.map(d => d.id);

  sut(original, ['validation', 'review']);

  assert.deepEqual(original.map(d => d.id), originalIds, 'input array order must not change');
  assert.equal(original[0].enabled, true, 'input descriptor objects must not be mutated');
  assert.equal(original[1].enabled, true, 'input descriptor objects must not be mutated');
});

test('Given a disabled descriptor sandwiched between reordered phases, when applyReorder runs, then the disabled descriptor keeps its position', () => {
  const sut = applyReorder;
  const descriptors = [
    makeDescriptor('review'),             // index 0 — in reorderSet
    makeDescriptor('refactoring', false), // index 1 — NOT in reorderSet
    makeDescriptor('validation'),         // index 2 — in reorderSet
  ];

  const result = sut(descriptors, ['validation', 'review']);

  assert.equal(result.descriptors[0].id, 'validation');
  assert.equal(result.descriptors[1].id, 'refactoring');
  assert.equal(result.descriptors[2].id, 'review');
});
