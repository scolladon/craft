'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { sliceProse, sliceRegion, TO_END } = require('./helpers/region-slice');
const ROOT = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), 'utf8');

const SPEC = read('docs', 'contributing', 'specs', 'run-record.md');
const vocabulary = () => sliceRegion(SPEC, /^## Token vocabulary/, /^## (?!Token vocabulary)/);

test('Given the run-record spec run directory block, when read, then it names the impacts store', () => {
  const sut = sliceProse(SPEC, /^## Run directory/, /^## Token vocabulary/);

  assert.ok(sut.includes('<run-id>.impacts.md'));
});

test('Given the run-record spec vocabulary, when read, then it names both impact tokens', () => {
  const sut = vocabulary();

  assert.ok(sut.includes('DEFERRED(<file>): I<n> <title>'));
  assert.ok(sut.includes('TRIAGED(I<n>): <verdict> — <rationale>'));
});

test('Given the run-record spec vocabulary table rows, when read, then no row names an impact token', () => {
  const rows = vocabulary().split('\n').filter((line) => line.startsWith('|'));

  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => !row.includes('DEFERRED(') && !row.includes('TRIAGED(')));
});

test('Given the run-record write cadence, when read, then it lists defer and verdict', () => {
  const sut = sliceRegion(SPEC, /^## Write cadence/, /^## (?!Write cadence)/);

  assert.ok(sut.includes('**`defer`**'));
  assert.ok(sut.includes('**`verdict`**'));
});

test('Given the PR body template, when its Provenance list is read, then it carries a Discovered impacts line', () => {
  const sut = sliceProse(read('templates', 'pr-body.md'), /^### Provenance/, TO_END);

  assert.ok(sut.includes('- **Discovered impacts:** '));
});

test('Given the backlog spec Filing section, when read, then filing is not a port operation and a custom source files nothing', () => {
  const sut = sliceProse(read('docs', 'contributing', 'specs', 'backlog.md'), /^## Filing/, /^## (?!Filing)/);

  assert.ok(sut.includes('not a port operation'));
  assert.ok(sut.includes('source: custom'));
  assert.ok(sut.includes('NO-OP(impact-triage): no file-backed backlog — verdicts in the PR body only'));
});
