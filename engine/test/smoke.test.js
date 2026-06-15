import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';

test('Given the test runner, when a trivial assertion runs, then it passes', () => {
  const result = 1 + 1;
  assert.equal(result, 2);
});

test('Given an ESM dependency, when imported from node_modules, then it resolves', () => {
  const result = load('forge: engine');
  assert.deepEqual(result, { forge: 'engine' });
});
