'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLAN_DIR = path.join(__dirname, '..', 'docs', 'contributing', 'plan');

// A structural (not content-validating) reading of CommonMark fenced code blocks:
// an opener is a column-0..3 run of 3+ backticks or tildes; a closer is a run of
// the SAME character, AT LEAST as long, with nothing but whitespace after it.
// A line with an info string (e.g. "```mermaid") can open a fence but can never
// close one, mirroring the CommonMark spec. A backtick-fence info string may
// never itself contain a backtick (CommonMark 4.5) — such a line is not an
// opener at all (tilde fences carry no such restriction).
const FENCE_LINE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

function isFenceOpener(fenceChar, infoString) {
  return fenceChar !== '`' || !infoString.includes('`');
}

function findUnclosedFenceOpenLine(markdown) {
  const lines = markdown.split('\n');
  let openFenceChar = null;
  let openFenceLength = 0;
  let openFenceLine = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const match = FENCE_LINE_PATTERN.exec(line);

    if (openFenceChar === null) {
      if (match && isFenceOpener(match[1][0], match[2])) {
        openFenceChar = match[1][0];
        openFenceLength = match[1].length;
        openFenceLine = lineNumber;
      }
      return;
    }

    const closesOpenFence =
      match &&
      match[1][0] === openFenceChar &&
      match[1].length >= openFenceLength &&
      match[2].trim() === '';

    if (closesOpenFence) {
      openFenceChar = null;
      openFenceLength = 0;
      openFenceLine = null;
    }
  });

  return openFenceLine;
}

function listPlanDocs() {
  return fs
    .readdirSync(PLAN_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort();
}

test('Given every plan doc under docs/contributing/plan, when scanned for CommonMark fence balance, then none ends inside an open fence', () => {
  const offenders = listPlanDocs()
    .map((name) => {
      const filePath = path.join(PLAN_DIR, name);
      const openLine = findUnclosedFenceOpenLine(fs.readFileSync(filePath, 'utf8'));
      return openLine === null ? null : `${name} (opened at line ${openLine})`;
    })
    .filter((offender) => offender !== null);

  assert.deepStrictEqual(
    offenders,
    [],
    `expected no unclosed fences; offenders: ${offenders.join(', ')}`
  );
});

test('Given docs-audience-split.md, whose raw column-zero fence-line count is odd, when scanned under the CommonMark-faithful reading, then it still reports balanced', () => {
  const sut = fs.readFileSync(path.join(PLAN_DIR, 'docs-audience-split.md'), 'utf8');
  const rawFenceLineCount = sut.split('\n').filter((line) => FENCE_LINE_PATTERN.test(line)).length;

  assert.strictEqual(rawFenceLineCount % 2, 1, 'raw column-zero fence-line count must be odd');
  assert.strictEqual(findUnclosedFenceOpenLine(sut), null);
});

test('Given a fence opener followed by a same-length same-character line carrying an info string, when scanned, then the info-string line does not close the fence', () => {
  const sut = ['```', '```mermaid', 'body', '```'].join('\n');

  assert.strictEqual(findUnclosedFenceOpenLine(sut), null);
});

test('Given a backtick run whose info string itself contains a backtick, when scanned, then it is not treated as a fence opener, so a genuine unclosed fence right after it is still reported', () => {
  const sut = ['``` `inline code` ``` prose noise', '```', 'body', 'still open'].join('\n');

  assert.strictEqual(findUnclosedFenceOpenLine(sut), 2);
});

test('Given markdown whose last fence is never closed, when scanned, then the opening line number of that fence is reported', () => {
  const sut = ['intro', '```', 'body', 'still open'].join('\n');

  assert.strictEqual(findUnclosedFenceOpenLine(sut), 2);
});
