/**
 * Unit tests for engine/src/exec-harness.js — isExecutingHarness predicate.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExecutingHarness, EXECUTING_HARNESS_CONTRACT } from '../src/exec-harness.js';

// ─── KILL: exec-harness.js:23 archetype guard ────────────────────────────────
// Mutant: descriptor.archetype === HARNESS_ARCHETYPE && … → true && …
// A non-harness archetype descriptor carrying harness-exec contract must return false.

test('Given a descriptor with archetype construction and harness-exec in contract, when isExecutingHarness runs, then returns false (archetype guard rejects non-harness)', () => {
  const sut = isExecutingHarness;
  const descriptor = { archetype: 'construction', contract: [EXECUTING_HARNESS_CONTRACT] };

  const result = sut(descriptor);

  assert.equal(result, false);
});

test('Given a descriptor with archetype harness and harness-exec in contract, when isExecutingHarness runs, then returns true', () => {
  const sut = isExecutingHarness;
  const descriptor = { archetype: 'harness', contract: [EXECUTING_HARNESS_CONTRACT] };

  const result = sut(descriptor);

  assert.equal(result, true);
});

test('Given a descriptor with archetype harness but contract missing harness-exec, when isExecutingHarness runs, then returns false', () => {
  const sut = isExecutingHarness;
  const descriptor = { archetype: 'harness', contract: ['harness-read'] };

  const result = sut(descriptor);

  assert.equal(result, false);
});

test('Given a descriptor with archetype delivery and no harness-exec in contract, when isExecutingHarness runs, then returns false', () => {
  const sut = isExecutingHarness;
  const descriptor = { archetype: 'delivery', contract: ['delivery'] };

  const result = sut(descriptor);

  assert.equal(result, false);
});
