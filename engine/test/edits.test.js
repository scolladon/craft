import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReorder, checkReorderApplicability, applyEnableEdits } from '../src/edits.js';

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

// ─── Group C: applyAllowedOverrides (via applyEnableEdits) — harness deep-merge ──

function makeHarnessDescriptor(id, harness) {
  return { id, enabled: true, contract: [], consumes: [], produces: [], self_supply: [], harness };
}

function applyOverride(descriptor, override) {
  const skipSet = new Set();
  const phaseOverrides = new Map([[descriptor.id, override]]);
  const { descriptors } = applyEnableEdits([descriptor], skipSet, phaseOverrides);
  return descriptors[0];
}

test('Given descriptor.harness: { tool: "stryker", scope: "per-hunk" } and override.harness: { scope: "per-file" }, when applyAllowedOverrides runs, then result.harness is { tool: "stryker", scope: "per-file" } (tool preserved, scope overridden)', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('validation', { tool: 'stryker', scope: 'per-hunk' });

  const result = sut(descriptor, { harness: { scope: 'per-file' } });

  assert.deepEqual(result.harness, { tool: 'stryker', scope: 'per-file' });
});

test('Given descriptor.harness: { tool: "stryker", scope: "per-hunk" } and override.harness: { max_cycles: 2 }, when applyAllowedOverrides runs, then result.harness contains tool, scope, and max_cycles', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('validation', { tool: 'stryker', scope: 'per-hunk' });

  const result = sut(descriptor, { harness: { max_cycles: 2 } });

  assert.deepEqual(result.harness, { tool: 'stryker', scope: 'per-hunk', max_cycles: 2 });
});

test('Given descriptor.harness is a non-plain value (array) and override.harness: { scope: "per-file" }, when applyAllowedOverrides runs, then result.harness is scalar-replaced (the descriptor-side plain-object guard holds)', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('review', ['legacy']);

  const result = sut(descriptor, { harness: { scope: 'per-file' } });

  assert.deepEqual(result.harness, { scope: 'per-file' });
});

test('Given descriptor has no harness and override.harness: { scope: "per-file" }, when applyAllowedOverrides runs, then result.harness is { scope: "per-file" } (scalar-replace fallback)', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('review', undefined);

  const result = sut(descriptor, { harness: { scope: 'per-file' } });

  assert.deepEqual(result.harness, { scope: 'per-file' });
});

test('Given override.harness is null, when applyAllowedOverrides runs, then result.harness is null (scalar-replace for non-object)', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('validation', { tool: 'stryker' });

  const result = sut(descriptor, { harness: null });

  assert.equal(result.harness, null);
});

test('Given descriptor.harness: { dimensions: ["code","tests"] } and override.harness: { dimensions: ["code"] }, when applyAllowedOverrides runs, then result.harness.dimensions is ["code"] (array replace, not union)', () => {
  const sut = applyOverride;
  const descriptor = makeHarnessDescriptor('review', { dimensions: ['code', 'tests'] });

  const result = sut(descriptor, { harness: { dimensions: ['code'] } });

  assert.deepEqual(result.harness.dimensions, ['code']);
});

test('Given descriptor has harness and override.role: "my:role", when applyAllowedOverrides runs, then role is scalar-replaced (scalar semantics unchanged)', () => {
  const sut = applyOverride;
  const descriptor = { ...makeHarnessDescriptor('review', { tool: 'stryker' }), role: 'forge:reviewer' };

  const result = sut(descriptor, { role: 'my:role', harness: { scope: 'per-file' } });

  assert.equal(result.role, 'my:role');
  assert.equal(result.harness.tool, 'stryker');
  assert.equal(result.harness.scope, 'per-file');
});

test('Given a frozen input harness, when applyAllowedOverrides runs, then the input descriptor.harness is not mutated (immutability)', () => {
  const sut = applyOverride;
  // Freeze mirrors the deep-frozen descriptors the real resolver passes: any in-place
  // write would throw, turning a silent mutation into a hard failure.
  const harnessBefore = Object.freeze({ tool: 'stryker', scope: 'per-hunk' });
  const descriptor = makeHarnessDescriptor('validation', harnessBefore);

  sut(descriptor, { harness: { scope: 'per-file', max_cycles: 2 } });

  assert.deepEqual(descriptor.harness, { tool: 'stryker', scope: 'per-hunk' });
});
