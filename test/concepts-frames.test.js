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
  assert.notEqual(startIdx, -1, `region start ${startPattern} not found — heading renamed?`);
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
  // Derived, not hardcoded: asserting a specific stale word would become an
  // unfixable red the day the count legitimately returns to that number.
  const staleCounts = Object.values(COUNT_WORDS).filter((w) => w !== word);
  for (const stale of staleCounts) {
    for (const shape of [`${stale} frames`, `${stale} familiar frames`]) {
      assert.ok(!readme.includes(shape), `README.md must not still say "${shape}"`);
    }
  }
});

test('Given the README enumerates the frames, then every frame source is named', () => {
  const sentence = sliceFrom(readme, /^New to this way of working\?/, /^## /);

  // Derived, not hardcoded: a sixth frame's source must not be droppable silently.
  // Newline-excluded: a frame with no external source (e.g. "configuration
  // layers") carries no colon, and must not swallow the next frame's heading.
  const sources = [...concepts.matchAll(/^## Frame \d+ — ([^:\n]+?):/gm)].map((m) => m[1].trim());
  assert.ok(sources.length >= 4, `expected frame sources in the guide, got ${sources.length}`);
  for (const source of sources) {
    assert.ok(sentence.includes(source), `README.md frame list omits ${source}`);
  }
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
  // file), so its "landed" proof is the committed spec page that owns it. The spec
  // must name the same literal the row does, or renaming the path in the row alone
  // would keep this green — the exact drift this test exists to catch.
  const specPath = path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md');
  assert.ok(fs.existsSync(specPath));
  assert.ok(
    fs.readFileSync(specPath, 'utf8').includes('.claude/craft-run-record.md'),
    'the spec page must name the same ledger path the Frame 5 row names'
  );
  assert.ok(fs.existsSync(path.join(ROOT, 'engine', 'bin', 'filter-findings.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'engine', 'bin', 'plan-lint.js')));
});
