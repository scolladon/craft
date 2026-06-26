import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTempCwd } from '../test-helpers/with-cwd.js';

test('Given a successful fn, when withTempCwd runs it, then cwd is restored and scratch dir removed after', async () => {
  // Arrange
  const sut = withTempCwd;
  const priorCwd = process.cwd();
  let insideCwd;

  // Act
  const result = await sut(() => {
    insideCwd = process.cwd();
    return insideCwd;
  });

  // Assert
  assert.notEqual(insideCwd, priorCwd, 'inside cwd should differ from prior cwd');
  assert.ok(existsSync(insideCwd) === false, 'scratch dir should be removed after success');
  assert.equal(process.cwd(), priorCwd, 'cwd should be restored after success');
  assert.equal(result, insideCwd, 'fn return value should be passed through');
});

test('Given a throwing fn, when withTempCwd runs it, then cwd is restored and scratch dir removed after throw', async () => {
  // Arrange
  const sut = withTempCwd;
  const priorCwd = process.cwd();
  let insideCwd;

  // Act + Assert
  await assert.rejects(
    () => sut(() => {
      insideCwd = process.cwd();
      throw new Error('boom');
    }),
    /boom/,
  );

  assert.equal(process.cwd(), priorCwd, 'cwd should be restored after throw');
  assert.ok(existsSync(insideCwd) === false, 'scratch dir should be removed after throw');
});

test('Given a seed callback, when withTempCwd(seed, fn) runs, then seed populates the scratch cwd visible to fn and the scratch is removed after', async () => {
  // Arrange
  const sut = withTempCwd;
  let scratchPath;

  // Act
  const result = await sut(
    (dir) => {
      scratchPath = dir;
      writeFileSync(join(dir, 'seeded.txt'), 'hi');
    },
    () => readFileSync(join(process.cwd(), 'seeded.txt'), 'utf8'),
  );

  // Assert
  assert.equal(result, 'hi', 'seed-written file should be readable from inside the scratch cwd');
  assert.ok(existsSync(scratchPath) === false, 'seeded scratch dir should be removed after success');
});
