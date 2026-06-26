import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
// Importing the helper runs its redirect side effect; these tests verify it.
import { emptyHomeDir, priorHome, priorProfile, restoreEmptyHome } from '../test-helpers/empty-home.js';

test('Given empty-home is imported, when HOME is read, then it points at the created empty scratch home', () => {
  // Arrange
  const sut = emptyHomeDir;

  // Act
  const result = process.env.HOME;

  // Assert
  assert.equal(result, sut, 'HOME should point at the scratch home');
  assert.equal(process.env.USERPROFILE, sut, 'USERPROFILE should point at the same scratch home');
  assert.ok(existsSync(sut), 'scratch home directory should exist while active');
});

test('Given restoreEmptyHome is called, when checked, then HOME and USERPROFILE are restored to their prior values and the scratch home is removed', () => {
  // Arrange
  const sut = restoreEmptyHome;

  // Act
  sut();

  // Assert
  assert.equal(process.env.HOME, priorHome, 'HOME should be restored to its prior value');
  assert.equal(process.env.USERPROFILE, priorProfile, 'USERPROFILE should be restored to its prior value');
  assert.ok(existsSync(emptyHomeDir) === false, 'scratch home directory should be removed after restore');
});

// Idempotent safety net: ensure the redirect is torn down even if the restore test above
// is filtered out, without disturbing it when it ran (restoreEmptyHome is idempotent).
after(() => { restoreEmptyHome(); });
