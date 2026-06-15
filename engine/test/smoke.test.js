import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Given the test runner, when a trivial assertion runs, then it passes', () => {
  const result = 1 + 1;
  assert.equal(result, 2);
});
