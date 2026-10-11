'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

const { FROM_TOP, TO_END, sliceRegion, sliceProse, normaliseWhitespace } = require('./helpers/region-slice');

const FIXTURE = [
  'Preamble line',
  '## First',
  '- <https://example.com/one>',
  '- <https://example.com/two>',
  '## Second',
  '- a bullet whose phrase wraps',
  '  across an indented continuation',
].join('\n');
const FIRST_SECTION = ['## First', '- <https://example.com/one>', '- <https://example.com/two>'].join('\n');
const SECOND_SECTION = ['## Second', '- a bullet whose phrase wraps', '  across an indented continuation'].join('\n');
const TOP_LINE = 'Preamble line';

const ANY_HEADING = /^## /u;
const FIRST_HEADING = /^## First$/u;
const SECOND_HEADING = /^## Second$/u;
const ABSENT_HEADING = /^## Absent$/u;
const TOP_LINE_PATTERN = /^Preamble line$/u;
const URL_BULLET = /^- <https?:/gmu;
const URL_BULLET_COUNT = 2;
const SECOND_SECTION_PROSE = '## Second - a bullet whose phrase wraps across an indented continuation';

const START_NOT_FOUND = { name: 'AssertionError', message: /region start .* not found — heading renamed\?/u };
const END_NOT_FOUND = { name: 'AssertionError', message: /region end .* not found — heading renamed\?/u };
const STRING_HEADING = '## Second';
const START_WRONG_TYPE = { name: 'TypeError', message: 'region start must be a RegExp or FROM_TOP' };
const END_WRONG_TYPE = { name: 'TypeError', message: 'region end must be a RegExp or TO_END' };

const WRONG_TYPE_END_CALLS = [
  ['omitted', (sut) => sut(FIXTURE, FIRST_HEADING)],
  ['undefined', (sut) => sut(FIXTURE, FIRST_HEADING, undefined)],
  ['null', (sut) => sut(FIXTURE, FIRST_HEADING, null)],
  ['string', (sut) => sut(FIXTURE, FIRST_HEADING, STRING_HEADING)],
];
const WRONG_TYPE_START_CALLS = [
  ['omitted', (sut) => sut(FIXTURE)],
  ['undefined', (sut) => sut(FIXTURE, undefined, SECOND_HEADING)],
  ['null', (sut) => sut(FIXTURE, null, SECOND_HEADING)],
  ['string', (sut) => sut(FIXTURE, STRING_HEADING, TO_END)],
];

test('Given a start and an end pattern, when the region is sliced, then it includes the start line and excludes the end line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FIRST_HEADING, SECOND_HEADING);

  assert.strictEqual(result, FIRST_SECTION);
});

test('Given an end pattern that also matches the start line, when the region is sliced, then it ends at the next matching line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FIRST_HEADING, ANY_HEADING);

  assert.strictEqual(result, FIRST_SECTION);
});

test('Given a start pattern that matches no line, when the region is sliced, then it fails naming the missing start', () => {
  const sut = sliceRegion;

  const act = () => sut(FIXTURE, ABSENT_HEADING, ANY_HEADING);

  assert.throws(act, START_NOT_FOUND);
});

test('Given an end pattern that matches no line after the start, when the region is sliced, then it fails instead of widening to the end of the file', () => {
  const sut = sliceRegion;

  const act = () => sut(FIXTURE, FIRST_HEADING, ABSENT_HEADING);

  assert.throws(act, END_NOT_FOUND);
});

test('Given an end boundary that is neither a RegExp nor TO_END, when the region is sliced, then it throws a TypeError', () => {
  const sut = sliceRegion;

  for (const [label, call] of WRONG_TYPE_END_CALLS) {
    assert.throws(() => call(sut), END_WRONG_TYPE, label);
  }
});

test('Given a start boundary that is neither a RegExp nor FROM_TOP, when the region is sliced, then it throws a TypeError', () => {
  const sut = sliceRegion;

  for (const [label, call] of WRONG_TYPE_START_CALLS) {
    assert.throws(() => call(sut), START_WRONG_TYPE, label);
  }
});

test('Given a region of bullet lines, when it is sliced faithfully, then a multiline anchor counts every bullet', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FIRST_HEADING, ANY_HEADING);

  assert.strictEqual(result.match(URL_BULLET).length, URL_BULLET_COUNT);
});

test('Given TO_END as the end boundary, when the region is sliced, then it runs to the last line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, SECOND_HEADING, TO_END);

  assert.strictEqual(result, SECOND_SECTION);
});

test('Given FROM_TOP as the start boundary, when the region is sliced, then it starts at the first line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FROM_TOP, FIRST_HEADING);

  assert.strictEqual(result, TOP_LINE);
});

test('Given FROM_TOP and an end pattern matching the first line, when the region is sliced, then the end is searched from the first line', () => {
  const sut = sliceRegion;

  const result = sut(FIXTURE, FROM_TOP, TOP_LINE_PATTERN);

  assert.strictEqual(result, '');
});

test('Given a bullet that wraps onto an indented continuation, when the region is sliced as prose, then only that region comes back with its whitespace collapsed', () => {
  const sut = sliceProse;

  const result = sut(FIXTURE, SECOND_HEADING, TO_END);

  assert.strictEqual(result, SECOND_SECTION_PROSE);
});

test('Given a mixed run of spaces, tabs and newlines, when whitespace is normalised, then the run collapses to one space', () => {
  const sut = normaliseWhitespace;

  const result = sut('a \t\n  b');

  assert.strictEqual(result, 'a b');
});
