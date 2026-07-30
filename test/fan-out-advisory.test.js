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
    assert.ok(
      prose.includes(word) || prose.includes(digits),
      `${rel.join('/')} must state the fan-out threshold (${digits} / ${word})`,
    );
  }
});

test('Given the advisory names a cost basis, then the guide section it points at exists', () => {
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'guides', 'customizing.md'), 'utf8');

  const result = guide.includes('Cost basis for the fan-out advisory');

  assert.ok(result, 'customizing.md must carry the cost-basis section the advisory line cites');
});
