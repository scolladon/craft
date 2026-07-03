import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatCacheSplit } from '../src/observability/adapters/claude/metrics-split.js';

// ── 1. formatCacheSplit — full split present ───────────────────────────────────

test('Given usage with both cache fields, when formatCacheSplit runs, then it returns the read/creation split', () => {
  const usage = {
    input_tokens: 100,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 50,
    output_tokens: 30,
  };
  const sut = formatCacheSplit;

  const result = sut(usage);

  assert.equal(result, 'cache_read=200 cache_creation=50');
});

// ── 2. formatCacheSplit — zero-valued but present cache fields ─────────────────

test('Given usage with cache fields present but zero, when formatCacheSplit runs, then it returns zero split not na', () => {
  const usage = {
    input_tokens: 10,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 5,
  };
  const sut = formatCacheSplit;

  const result = sut(usage);

  assert.equal(result, 'cache_read=0 cache_creation=0');
});

// ── 3. formatCacheSplit — only cacheRead present ───────────────────────────────

test('Given usage with only cache_read_input_tokens, when formatCacheSplit runs, then it returns split with creation=0', () => {
  const usage = {
    input_tokens: 5,
    cache_read_input_tokens: 100,
    output_tokens: 2,
  };
  const sut = formatCacheSplit;

  const result = sut(usage);

  assert.equal(result, 'cache_read=100 cache_creation=0');
});

// ── 4. formatCacheSplit — only cacheCreation present ──────────────────────────

test('Given usage with only cache_creation_input_tokens, when formatCacheSplit runs, then it returns split with read=0', () => {
  const usage = {
    input_tokens: 5,
    cache_creation_input_tokens: 75,
    output_tokens: 2,
  };
  const sut = formatCacheSplit;

  const result = sut(usage);

  assert.equal(result, 'cache_read=0 cache_creation=75');
});

// ── 5. formatCacheSplit — null usage degrades to cache=na ─────────────────────

test('Given null usage, when formatCacheSplit runs, then it returns cache=na', () => {
  const sut = formatCacheSplit;

  const result = sut(null);

  assert.equal(result, 'cache=na');
});

// ── 6. formatCacheSplit — undefined usage degrades to cache=na ────────────────

test('Given undefined usage, when formatCacheSplit runs, then it returns cache=na', () => {
  const sut = formatCacheSplit;

  const result = sut(undefined);

  assert.equal(result, 'cache=na');
});

// ── 7. formatCacheSplit — empty object degrades to cache=na ───────────────────

test('Given a usage object with no cache fields, when formatCacheSplit runs, then it returns cache=na', () => {
  const usage = { input_tokens: 10, output_tokens: 5 };
  const sut = formatCacheSplit;

  const result = sut(usage);

  assert.equal(result, 'cache=na');
});

// ── 8. formatCacheSplit — non-object non-null degrades to cache=na (typeof guard) ──

test('Given a numeric usage value (non-object, non-null), when formatCacheSplit runs, then it returns cache=na without throwing', () => {
  const sut = formatCacheSplit;

  const result = sut(42);

  assert.equal(result, 'cache=na');
});
