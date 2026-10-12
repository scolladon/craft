'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { withAmbientEnv } = require('./helpers/ambient-env');

const PROBE_KEY = 'CRAFT_AMBIENT_ENV_PROBE';

test('Given a key absent from process.env, when withAmbientEnv sets it around act, then act sees the value and the key is absent afterwards', () => {
  assert.ok(!(PROBE_KEY in process.env));
  const sut = withAmbientEnv;
  let observed;

  sut({ [PROBE_KEY]: 'during' }, () => {
    observed = process.env[PROBE_KEY];
  });

  assert.strictEqual(observed, 'during');
  assert.strictEqual(PROBE_KEY in process.env, false);
});

test('Given a key present in process.env, when withAmbientEnv overrides it around act, then the original value is restored afterwards', () => {
  assert.ok(!(PROBE_KEY in process.env));
  process.env[PROBE_KEY] = 'original';
  try {
    const sut = withAmbientEnv;

    sut({ [PROBE_KEY]: 'during' }, () => undefined);

    assert.strictEqual(process.env[PROBE_KEY], 'original');
  } finally {
    delete process.env[PROBE_KEY];
  }
});

test('Given an act that throws, when withAmbientEnv runs it, then the error propagates and the key is restored', () => {
  assert.ok(!(PROBE_KEY in process.env));
  const sut = withAmbientEnv;

  assert.throws(
    () =>
      sut({ [PROBE_KEY]: 'during' }, () => {
        throw new Error('boom');
      }),
    /boom/
  );

  assert.strictEqual(PROBE_KEY in process.env, false);
});

test('Given an act returning a value, when withAmbientEnv runs it, then it returns that value', () => {
  assert.ok(!(PROBE_KEY in process.env));
  const sut = withAmbientEnv;

  const result = sut({ [PROBE_KEY]: 'during' }, () => 'returned');

  assert.strictEqual(result, 'returned');
});
