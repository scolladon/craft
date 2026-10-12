'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const README = path.join(ROOT, 'README.md');
const SURFACE = 'README.md';
const SECTION_HEADING = '## How craft compares';
const PRECEDING_HEADING = '## What craft is not';
const FOLLOWING_HEADING = '## Quickstart';
const CRAFT_COLUMN = 'craft';
const RELATIVE_LINK = /\]\((?!https?:)[^)]+\)/;
const ANY_DIGIT = /\d/;
const SEPARATOR_ROW = /^\|[\s|:-]+\|$/;

function sectionOf(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return null;
  const bodyStart = start + heading.length;
  const next = text.indexOf('\n## ', bodyStart);
  return text.slice(start, next === -1 ? text.length : next);
}

function tableRows(section) {
  return section
    .split('\n')
    .filter(line => line.startsWith('|') && !SEPARATOR_ROW.test(line))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
}

function comparisonViolations(readmeText) {
  const section = sectionOf(readmeText, SECTION_HEADING);
  if (section === null) return [`${SURFACE}: missing section "${SECTION_HEADING}"`];
  const violations = [];
  const at = readmeText.indexOf(SECTION_HEADING);
  const before = readmeText.indexOf(PRECEDING_HEADING);
  const after = readmeText.indexOf(FOLLOWING_HEADING);
  if (before === -1 || at < before || after === -1 || at > after) {
    violations.push(`${SURFACE}: "${SECTION_HEADING}" must sit between "${PRECEDING_HEADING}" and "${FOLLOWING_HEADING}"`);
  }
  const [header, ...body] = tableRows(section);
  const column = header ? header.indexOf(CRAFT_COLUMN) : -1;
  if (column === -1) {
    violations.push(`${SURFACE}: comparison table has no "${CRAFT_COLUMN}" column`);
  } else {
    body
      .filter(row => !RELATIVE_LINK.test(row[column] || ''))
      .forEach(row => violations.push(`${SURFACE}: craft cell "${row[column]}" has no relative evidence link`));
  }
  if (ANY_DIGIT.test(section)) violations.push(`${SURFACE}: comparison section holds a digit`);
  return violations;
}

const live = fs.readFileSync(README, 'utf8');
const craftCellOf = rowStart => live.split('\n').find(line => line.startsWith(rowStart));

test('Given README.md, when the comparison section is validated, then it sits between what craft is not and the quickstart, links evidence from every craft cell and holds no digit', () => {
  const sut = comparisonViolations;

  const result = sut(live);

  assert.deepStrictEqual(result, []);
});

test('Given a digit added to a cell, when validated, then a violation names README.md', () => {
  const sut = comparisonViolations;
  const bad = live.replace('| baseline |', '| baseline 2 |');

  const result = sut(bad);

  assert.ok(result.some(m => m.startsWith(SURFACE) && m.includes('digit')), result.join('\n'));
});

test('Given a craft cell link made absolute, when validated, then a violation names README.md', () => {
  const sut = comparisonViolations;
  const bad = live.replace('](contracts/)', '](https://example.com)');

  const result = sut(bad);

  assert.ok(result.some(m => m.startsWith(SURFACE) && m.includes('evidence link')), result.join('\n'));
});

test('Given a craft cell with its link removed, when validated, then a violation names README.md', () => {
  const sut = comparisonViolations;
  const row = craftCellOf('| Where the process lives');
  const bad = live.replace(row, row.replace(/\[contracts\]\(contracts\/\)/, 'contracts'));

  const result = sut(bad);

  assert.ok(result.some(m => m.startsWith(SURFACE) && m.includes('evidence link')), result.join('\n'));
});

test('Given the section moved after the quickstart, when validated, then a violation names README.md', () => {
  const sut = comparisonViolations;
  const section = sectionOf(live, SECTION_HEADING);
  const moved = live.replace(`${section}\n`, '').replace('\n## License', `\n${section}\n## License`);

  const result = sut(moved);

  assert.ok(result.some(m => m.startsWith(SURFACE) && m.includes('must sit between')), result.join('\n'));
});
