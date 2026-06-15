import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALIAS_MAP, resolveAlias } from '../src/alias-map.js';

const EXPECTED_ALIASES = [
  ['branch',    'workspace'],
  ['prd',       'requirements'],
  ['adr',       'decisions'],
  ['plan',      'planning'],
  ['implement', 'implementation'],
  ['mutation',  'validation'],
  ['refactor',  'refactoring'],
  ['docs',      'documentation'],
  ['pr',        'propose'],
  ['merge',     'integrate'],
];

test('Given the alias map, when counting entries, then it has exactly 10 entries', () => {
  const result = Object.keys(ALIAS_MAP).length;
  assert.equal(result, 10);
});

for (const [oldName, canonical] of EXPECTED_ALIASES) {
  test(`Given old name "${oldName}", when resolveAlias is called, then it returns "${canonical}"`, () => {
    const result = resolveAlias(oldName);
    assert.equal(result, canonical);
  });
}

const CANONICAL_IDS = EXPECTED_ALIASES.map(([, id]) => id);

for (const id of CANONICAL_IDS) {
  test(`Given canonical id "${id}", when resolveAlias is called, then it maps to itself`, () => {
    const result = resolveAlias(id);
    assert.equal(result, id);
  });
}

test('Given an unknown id, when resolveAlias is called, then it returns the input unchanged', () => {
  const result = resolveAlias('unknown-phase');
  assert.equal(result, 'unknown-phase');
});

for (const [oldName] of EXPECTED_ALIASES) {
  test(`Given old name "${oldName}", when resolveAlias is applied twice, then round-trip is stable`, () => {
    const once = resolveAlias(oldName);
    const twice = resolveAlias(once);
    assert.equal(twice, once);
  });
}
