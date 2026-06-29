import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PRICES,
  PRICES_AS_OF,
  mergePrices,
  loadPriceTable,
} from '../src/pricing-claude.js';

// ── 1. DEFAULT_PRICES shape ────────────────────────────────────────────────────

test('Given DEFAULT_PRICES, when read, then opus-4-8 input is 5 and output is 25 and cacheRead is input×0.1', () => {
  const sut = DEFAULT_PRICES;

  const result = sut['claude-opus-4-8'];

  assert.equal(result.input, 5);
  assert.equal(result.output, 25);
  assert.equal(result.cacheRead, result.input * 0.1);
});

// ── 2. DEFAULT_PRICES is frozen ────────────────────────────────────────────────

test('Given DEFAULT_PRICES, when an attempt mutates a value, then it throws because the table is frozen', () => {
  const sut = DEFAULT_PRICES;

  assert.throws(() => {
    sut['claude-opus-4-8'].input = 999;
  }, TypeError);
});

// ── 3. mergePrices — override wins and defaults unchanged ──────────────────────

test('Given an override that changes one model and adds one model, when mergePrices runs, then the result has the override values and untouched defaults, and DEFAULT_PRICES is unchanged', () => {
  const originalInput = DEFAULT_PRICES['claude-haiku-4-5'].input;
  const override = {
    'claude-haiku-4-5': { input: 99, cacheRead: 9.9, cacheCreation5m: 123.75, cacheCreation1h: 198, output: 495 },
    'claude-custom-1': { input: 7, cacheRead: 0.7, cacheCreation5m: 8.75, cacheCreation1h: 14, output: 35 },
  };
  const sut = mergePrices;

  const result = sut(DEFAULT_PRICES, override);

  assert.equal(result['claude-haiku-4-5'].input, 99);
  assert.equal(result['claude-custom-1'].input, 7);
  assert.equal(result['claude-opus-4-8'].input, DEFAULT_PRICES['claude-opus-4-8'].input);
  assert.equal(DEFAULT_PRICES['claude-haiku-4-5'].input, originalInput);
  assert.notEqual(result, DEFAULT_PRICES);
});

// ── 4. loadPriceTable with null → deep-equal copy ────────────────────────────

test('Given a null override, when loadPriceTable runs, then it returns a table deep-equal to DEFAULT_PRICES but a distinct object', () => {
  const sut = loadPriceTable;

  const result = sut(null);

  assert.deepEqual(result, DEFAULT_PRICES);
  assert.notEqual(result, DEFAULT_PRICES);
});

// ── 5. mergePrices — partial override keeps other rates, no NaN (B1) ──────────

test('Given a partial override supplying only the input rate, when mergePrices runs, then other rates survive from defaults and none are NaN', () => {
  const override = {
    'claude-haiku-4-5': { input: 99 },
  };
  const sut = mergePrices;

  const result = sut(DEFAULT_PRICES, override);

  assert.equal(result['claude-haiku-4-5'].input, 99);
  assert.ok(Number.isFinite(result['claude-haiku-4-5'].cacheRead), 'cacheRead must not be NaN');
  assert.ok(Number.isFinite(result['claude-haiku-4-5'].cacheCreation5m), 'cacheCreation5m must not be NaN');
  assert.ok(Number.isFinite(result['claude-haiku-4-5'].cacheCreation1h), 'cacheCreation1h must not be NaN');
  assert.ok(Number.isFinite(result['claude-haiku-4-5'].output), 'output must not be NaN');
});

// ── 7. PRICES_AS_OF is a date string ─────────────────────────────────────────

test('Given PRICES_AS_OF, when read, then it matches the ISO date pattern', () => {
  const sut = PRICES_AS_OF;

  assert.match(sut, /^\d{4}-\d{2}-\d{2}$/);
});

// ── 8. priceEntry multipliers — exact 5m and 1h cache-creation rates ──────────

test('Given DEFAULT_PRICES for claude-opus-4-8 with input=5, when read, then cacheCreation5m = 5*1.25 = 6.25 and cacheCreation1h = 5*2.0 = 10', () => {
  const sut = DEFAULT_PRICES;

  const entry = sut['claude-opus-4-8'];

  assert.equal(entry.cacheCreation5m, 6.25, 'cacheCreation5m must be input * 1.25');
  assert.equal(entry.cacheCreation1h, 10, 'cacheCreation1h must be input * 2.0');
});
