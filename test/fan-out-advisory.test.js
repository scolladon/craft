'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RESOLVE_SRC = path.join(ROOT, 'engine', 'src', 'resolve.js');

// The threshold is one constant restated in two prose surfaces. Without this pin,
// changing it silently leaves both docs asserting a number the engine no longer uses.
const NUMBER_WORDS = { 4: 'four', 6: 'six', 8: 'eight', 12: 'twelve' };

const PROSE_SURFACES = [
  ['skills', 'review', 'SKILL.md'],
  ['docs', 'guides', 'customizing.md'],
];

test('Given the fan-out threshold is stated in prose, then every surface carries the value the engine uses', () => {
  const source = fs.readFileSync(RESOLVE_SRC, 'utf8');

  const result = source.match(/FAN_OUT_ADVISORY_THRESHOLD = (\d+)/);

  assert.ok(result, 'expected FAN_OUT_ADVISORY_THRESHOLD in engine/src/resolve.js');
  const digits = result[1];
  const word = NUMBER_WORDS[Number(digits)];
  assert.ok(word, `no number word mapped for threshold ${digits} — extend NUMBER_WORDS`);

  for (const rel of PROSE_SURFACES) {
    const prose = fs.readFileSync(path.join(ROOT, ...rel), 'utf8');
    // The bare digit is NOT accepted: both guides carry unrelated numerals
    // (token counts, footnote markers), so a digit grep pins nothing.
    assert.ok(
      prose.includes(word),
      `${rel.join('/')} must state the fan-out threshold as the word "${word}" (engine value ${digits})`,
    );
  }
});

test('Given the advisory names a cost basis, then the file it points at exists and discusses cost', () => {
  const source = fs.readFileSync(RESOLVE_SRC, 'utf8');

  // Derived from production: pins the engine→doc link the advisory actually emits,
  // not an arbitrary heading string no code references.
  const pointer = source.match(/Cost basis: (\S+\.md)\b/);
  assert.ok(pointer, 'the advisory line must name a cost-basis file');
  const target = path.join(ROOT, pointer[1]);

  assert.ok(fs.existsSync(target), `${pointer[1]} named by the advisory does not exist`);
  assert.match(fs.readFileSync(target, 'utf8'), /cost basis/iu);
});
