import { test } from 'node:test';
import assert from 'node:assert/strict';
import { producersOf } from '../src/producers.js';

// --- one enabled producer ---

test('Given one descriptor producing the artifact, when producersOf runs, then it returns a single entry with correct index and enabled true', () => {
  const sut = [{ id: 'workspace', produces: ['workspace'], enabled: true }];
  const result = producersOf(sut, 'workspace');
  assert.deepEqual(result, [{ id: 'workspace', index: 0, enabled: true }]);
});

// --- two producers, one disabled ---

test('Given two producers one disabled, when producersOf runs, then both entries are returned with correct indices and enabled flags', () => {
  const sut = [
    { id: 'planning', produces: ['plan'], enabled: true },
    { id: 'planning-alt', produces: ['plan'], enabled: false },
  ];
  const result = producersOf(sut, 'plan');
  assert.deepEqual(result, [
    { id: 'planning', index: 0, enabled: true },
    { id: 'planning-alt', index: 1, enabled: false },
  ]);
});

// --- nobody produces the artifact ---

test('Given no descriptor produces the artifact, when producersOf runs, then it returns []', () => {
  const sut = [{ id: 'workspace', produces: ['workspace'], enabled: true }];
  const result = producersOf(sut, 'plan');
  assert.deepEqual(result, []);
});

// --- descriptor lacking produces ---

test('Given a descriptor with no produces field, when producersOf runs, then it is skipped without throwing', () => {
  const sut = [
    { id: 'noproduces', enabled: true },
    { id: 'workspace', produces: ['workspace'], enabled: true },
  ];
  const result = producersOf(sut, 'workspace');
  assert.deepEqual(result, [{ id: 'workspace', index: 1, enabled: true }]);
});

// --- index reflects position in passed array ---

test('Given producers at non-zero positions, when producersOf runs, then index reflects position in the passed array', () => {
  const sut = [
    { id: 'setup', produces: ['env'], enabled: true },
    { id: 'build', produces: ['artifact'], enabled: true },
    { id: 'publish', produces: ['artifact'], enabled: true },
  ];
  const result = producersOf(sut, 'artifact');
  assert.deepEqual(result, [
    { id: 'build', index: 1, enabled: true },
    { id: 'publish', index: 2, enabled: true },
  ]);
});

// --- T4: descriptor lacking the enabled key ---

test('Given a producing descriptor that lacks the enabled key, when producersOf runs, then the returned entry has enabled: false', () => {
  const sut = [{ id: 'orphan', produces: ['thing'] }];

  const result = producersOf(sut, 'thing');

  assert.deepEqual(result, [{ id: 'orphan', index: 0, enabled: false }]);
});
