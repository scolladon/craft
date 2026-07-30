'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONCEPTS_PATH = path.join(ROOT, 'docs', 'guides', 'concepts.md');
const README_PATH = path.join(ROOT, 'README.md');

const concepts = fs.readFileSync(CONCEPTS_PATH, 'utf8');
const readme = fs.readFileSync(README_PATH, 'utf8');

const COUNT_WORDS = { 4: 'four', 5: 'five', 6: 'six' };
const WORD_COUNTS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

function frameHeadingCount(content) {
  return (content.match(/^## Frame /gm) ?? []).length;
}

// Slices from the first line matching `startPattern` to the line before the next
// match of `endPattern` (or EOF when `endPattern` is absent) — the same
// region-isolation shape run-record.test.js uses, so a mention outside the
// target section can never satisfy a section-scoped assertion.
function sliceFrom(content, startPattern, endPattern) {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((line) => startPattern.test(line));
  if (startIdx === -1) return '';
  const searchFrom = startIdx + 1;
  const relativeEnd = endPattern
    ? lines.slice(searchFrom).findIndex((line) => endPattern.test(line))
    : -1;
  const endIdx = endPattern && relativeEnd !== -1 ? searchFrom + relativeEnd : lines.length;
  return lines.slice(startIdx, endIdx).join('\n');
}

test('Given the concepts guide, when its frame headings are counted, then there are five', () => {
  const result = frameHeadingCount(concepts);

  assert.strictEqual(result, 5);
});

test('Given the frame count, when README.md states it in prose, then the stated word matches the heading count', () => {
  const word = COUNT_WORDS[frameHeadingCount(concepts)];

  assert.ok(readme.includes(`${word} frames`), `expected README.md to state "${word} frames"`);
  assert.ok(
    readme.includes(`${word} familiar frames`),
    `expected README.md to state "${word} familiar frames"`
  );
  assert.ok(!readme.includes('four frames'), 'README.md must not still say "four frames"');
  assert.ok(
    !readme.includes('four familiar frames'),
    'README.md must not still say "four familiar frames"'
  );
});

test('Given the concepts guide states its own frame count, then every stated count matches the heading count', () => {
  assert.ok(!concepts.includes('four frames'));
  assert.ok(!concepts.includes('four external frames'));
  assert.ok(!concepts.includes('four external ways'));
  assert.ok(!concepts.includes('one of the four frames'));
});

test('Given the configuration-layer sentence counts layers and not frames, then it is preserved verbatim', () => {
  assert.ok(concepts.includes('Beneath all four sits the invariant floor'));
});

test('Given the Sources section, when its stated URL count is compared with its bullets, then they agree', () => {
  const section = sliceFrom(concepts, /^## Sources$/, null);
  const bulletCount = (section.match(/^- <https?:/gm) ?? []).length;
  const wordMatch = section.match(/(\w+) URLs\b/);

  assert.ok(wordMatch, 'expected a "<word> URLs" sentence in the Sources section');
  assert.strictEqual(WORD_COUNTS[wordMatch[1].toLowerCase()], bulletCount);
});

test('Given Frame 5 ships, then its mapping rows name only mechanisms that exist', () => {
  const section = sliceFrom(concepts, /^## Frame 5/, /^## /);

  assert.ok(section.length > 0, 'expected a "## Frame 5" section');
  assert.ok(section.includes('.claude/craft-run-record.md'));
  assert.ok(section.includes('engine/bin/filter-findings.js'));
  assert.ok(section.includes('engine/bin/plan-lint.js'));

  // The run-record ledger is a run-local, gitignored artifact (never a committed
  // file), so its "landed" proof is the committed spec page that owns it, not
  // the ephemeral ledger path itself — the other two rows name real shipped files.
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md')));
  assert.ok(fs.existsSync(path.join(ROOT, 'engine', 'bin', 'filter-findings.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'engine', 'bin', 'plan-lint.js')));
});
