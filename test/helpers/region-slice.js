'use strict';
const assert = require('node:assert');

// A section-scoped pin must fail when its boundary heading is renamed: widening
// a missing boundary to the whole file would turn the pin into a whole-file grep
// that passes for the wrong reason. So "from the top" and "to the end" are
// sentinels the caller states, never what a missing argument falls back to.
const FROM_TOP = Symbol('region: from the top of the file');
const TO_END = Symbol('region: to the end of the file');

const LINE_BREAK = '\n';
const WHITESPACE_RUN = /\s+/g;
const SINGLE_SPACE = ' ';
const NOT_FOUND = -1;
const FIRST_LINE = 0;

function normaliseWhitespace(text) {
  return text.replace(WHITESPACE_RUN, SINGLE_SPACE);
}

function startIndexOf(lines, start) {
  if (start === FROM_TOP) return FIRST_LINE;
  if (!(start instanceof RegExp)) throw new TypeError('region start must be a RegExp or FROM_TOP');
  const startIdx = lines.findIndex((line) => start.test(line));
  assert.notEqual(startIdx, NOT_FOUND, `region start ${start} not found — heading renamed?`);
  return startIdx;
}

// The end is searched from the line after the start, so a generic end such as
// /^## / never closes the region on its own start heading.
function endSearchFrom(start, startIdx) {
  return start === FROM_TOP ? FIRST_LINE : startIdx + 1;
}

function endIndexOf(lines, searchFrom, end) {
  if (end === TO_END) return lines.length;
  if (!(end instanceof RegExp)) throw new TypeError('region end must be a RegExp or TO_END');
  const relativeEnd = lines.slice(searchFrom).findIndex((line) => end.test(line));
  assert.notEqual(relativeEnd, NOT_FOUND, `region end ${end} not found — heading renamed?`);
  return searchFrom + relativeEnd;
}

function sliceRegion(content, start, end) {
  const lines = content.split(LINE_BREAK);
  const startIdx = startIndexOf(lines, start);
  const endIdx = endIndexOf(lines, endSearchFrom(start, startIdx), end);
  return lines.slice(startIdx, endIdx).join(LINE_BREAK);
}

// Prose pins quote sentences that word-wrap and indent across markdown lines;
// collapsing whitespace lets such a sentence match as one phrase.
function sliceProse(content, start, end) {
  return normaliseWhitespace(sliceRegion(content, start, end));
}

module.exports = { FROM_TOP, TO_END, sliceRegion, sliceProse, normaliseWhitespace };
