import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { assertFresh } from '../src/intention.js';

const PAGE = 'docs/adapters/intention.md';
const CONTENT = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', PAGE),
  'utf8',
);

const deps = {
  readPage: p => (p === PAGE ? CONTENT : null),
  listCorpus: () => [PAGE],
};

test('Given a changed intention source and the spec page untouched and unwaived, when assertFresh runs, then it reports a stale row for the real page', () => {
  const sut = assertFresh;
  const change = { changed: ['engine/src/intention.js'], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(
    result.stale.find(row => row.page === PAGE),
    { page: PAGE, changedPaths: ['engine/src/intention.js'], waived: false },
  );
});

test('Given the same change but the spec page itself touched, when assertFresh runs, then it reports no stale row for the page', () => {
  const sut = assertFresh;
  const change = { changed: ['engine/src/intention.js'], touched: [PAGE], waived: [] };

  const result = sut(change, deps);

  assert.equal(result.stale.find(row => row.page === PAGE), undefined);
});

test('Given the same change but the spec page waived, when assertFresh runs, then it reports a stale row flagged waived', () => {
  const sut = assertFresh;
  const change = { changed: ['engine/src/intention.js'], touched: [], waived: [PAGE] };

  const result = sut(change, deps);

  assert.deepEqual(
    result.stale.find(row => row.page === PAGE),
    { page: PAGE, changedPaths: ['engine/src/intention.js'], waived: true },
  );
});
