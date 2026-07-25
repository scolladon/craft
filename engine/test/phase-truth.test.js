import { test } from 'node:test';
import assert from 'node:assert/strict';

import { enabledPhaseIds } from '../src/phase-truth.js';

const THIRTEEN_DESCRIPTOR_LIST = [
  { id: 'workspace', archetype: 'checkpoint' },
  { id: 'requirements', archetype: 'checkpoint', enabled: false },
  { id: 'design', archetype: 'checkpoint' },
  { id: 'decisions', archetype: 'checkpoint' },
  { id: 'architecture', archetype: 'checkpoint', enabled: false },
  { id: 'planning', archetype: 'checkpoint' },
  { id: 'implementation', archetype: 'checkpoint' },
  { id: 'review', archetype: 'checkpoint' },
  { id: 'refactoring', archetype: 'checkpoint' },
  { id: 'validation', archetype: 'checkpoint' },
  { id: 'documentation', archetype: 'checkpoint' },
  { id: 'propose', archetype: 'checkpoint' },
  { id: 'integrate', archetype: 'checkpoint' },
];

const ELEVEN_PINNED_IDS = [
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

test('Given a descriptor list with one enabled:false, when enabledPhaseIds, then that descriptor is dropped (footgun regression)', () => {
  const sut = enabledPhaseIds;
  const descriptors = [{ id: 'a' }, { id: 'b', enabled: false }, { id: 'c' }];

  const result = sut(descriptors);

  assert.deepEqual(result, ['a', 'c']);
});

test('Given a descriptor with no enabled key, when enabledPhaseIds, then it is kept', () => {
  const sut = enabledPhaseIds;
  const descriptors = [{ id: 'a' }];

  const result = sut(descriptors);

  assert.deepEqual(result, ['a']);
});

test('Given a descriptor with enabled:true, when enabledPhaseIds, then it is kept', () => {
  const sut = enabledPhaseIds;
  const descriptors = [{ id: 'a', enabled: true }];

  const result = sut(descriptors);

  assert.deepEqual(result, ['a']);
});

test('Given a 13-descriptor list mirroring default.yml with two enabled:false entries, when enabledPhaseIds, then exactly the 11 pinned ids remain', () => {
  const sut = enabledPhaseIds;

  const result = sut(THIRTEEN_DESCRIPTOR_LIST);

  assert.deepEqual(new Set(result), new Set(ELEVEN_PINNED_IDS));
  assert.equal(result.length, ELEVEN_PINNED_IDS.length);
});
