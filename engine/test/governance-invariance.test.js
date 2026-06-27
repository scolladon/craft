import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleContract } from '../src/contract.js';
import { inferArchetype, inferMissingArchetypes } from '../src/archetype.js';
import { isExecutingHarness } from '../src/exec-harness.js';

// ─── governance invariants for archetype inference ────────────────────────────
// These proofs guard three properties that must hold regardless of how inference
// fills the archetype field: the core floor is always emitted, inference cannot
// manufacture executing-harness privilege, and the contract array is not consulted
// during inference.

test('Given a descriptor with inferred archetype:harness and empty contract, when assembleContract runs, then the output contains the core preamble', () => {
  const descriptor = { id: 'x', archetype: 'harness', contract: [] };
  const SENTINEL = 'CORE_PREAMBLE_SENTINEL';
  const fragments = { core: SENTINEL };

  const result = assembleContract(descriptor, null, fragments, { execution: 'agent' });

  assert.ok(result.includes(SENTINEL), `expected core preamble in output; got: ${result}`);
});

test('Given a descriptor with inferred archetype:harness but no harness-exec in contract, when isExecutingHarness runs, then it returns false', () => {
  const descriptor = { id: 'x', archetype: 'harness', contract: [] };

  const result = isExecutingHarness(descriptor);

  assert.equal(result, false);
});

test('Given a descriptor with contract:[harness-exec] but no harness block, gate, or produces, when inferArchetype runs, then contract is ignored and fallback harness is returned', () => {
  const descriptor = { id: 'x', contract: ['harness-exec'] };

  const result = inferArchetype(descriptor);

  assert.equal(result.archetype, 'harness');
  assert.equal(result.reason, 'fallback — most isolated');
});

// ─── T3: inference path proof ──────────────────────────────────────────────────

test('Given an archetype-less descriptor with gate and no produces, when inferMissingArchetypes then assembleContract runs, then the assembled contract equals that of the explicit harness descriptor', () => {
  const base = { id: 'x', procedure: 'craft:something', gate: 'make test', contract: [] };
  const fragments = { core: 'CORE_PREAMBLE_SENTINEL' };

  const { descriptors } = inferMissingArchetypes([base]);
  const inferred = descriptors[0];

  // This assertion is the load-bearing failure trigger: it fails when inference
  // returns the wrong archetype. assembleContract does not inspect archetype, so
  // the deepEqual below is necessary but not sufficient on its own.
  assert.equal(inferred.archetype, 'harness', `Expected inferred archetype to be harness, got: ${inferred.archetype}`);

  const result = assembleContract(inferred, null, fragments, { execution: 'agent' });
  const explicit = assembleContract({ ...base, archetype: 'harness' }, null, fragments, { execution: 'agent' });

  assert.deepEqual(result, explicit);
});
