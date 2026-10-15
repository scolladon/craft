import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VERDICT_DEADLINE_MS, resolveDeadlineMs } from '../src/verdict-deadline.js';

const COPILOT_FAIL_OPEN_HOOK_TIMEOUT_MS = 30000;

describe('resolveDeadlineMs()', () => {
  it('Given the default deadline, when compared to copilot hook timeout, then it is shorter so the guard answers before failing open', () => {
    const sut = DEFAULT_VERDICT_DEADLINE_MS;

    assert.ok(sut < COPILOT_FAIL_OPEN_HOOK_TIMEOUT_MS);
  });

  for (const [override, expected] of [
    [undefined, DEFAULT_VERDICT_DEADLINE_MS],
    ['600000', DEFAULT_VERDICT_DEADLINE_MS],
    ['5', 5],
    ['0', DEFAULT_VERDICT_DEADLINE_MS],
    ['-1', DEFAULT_VERDICT_DEADLINE_MS],
    ['abc', DEFAULT_VERDICT_DEADLINE_MS],
    ['Infinity', DEFAULT_VERDICT_DEADLINE_MS],
  ]) {
    it(`Given an override of ${String(override)}, when resolved, then the deadline is ${expected}`, () => {
      const sut = resolveDeadlineMs;

      const result = sut(override);

      assert.equal(result, expected);
    });
  }

  it('Given an override equal to the default, when resolved, then the default is kept', () => {
    const sut = resolveDeadlineMs;

    const result = sut(String(DEFAULT_VERDICT_DEADLINE_MS));

    assert.equal(result, DEFAULT_VERDICT_DEADLINE_MS);
  });
});
