import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTER_HEADER, formatRulingLine, parseRegister, parseRulingLine, sliceRulings } from '../src/rulings.js';

describe('parseRulingLine', () => {
  it('Given a line with empty paths and a statement only, when parsed, then it returns the id, no paths and the statement', () => {
    const sut = parseRulingLine;

    const result = sut('- R-901 [] Keep the parser pure.', 4);

    assert.equal(result.ruling.id, 901);
    assert.equal(result.ruling.line, 4);
    assert.deepEqual(result.ruling.paths, []);
    assert.equal(result.ruling.statement, 'Keep the parser pure');
  });

  it('Given a line with several paths, when parsed, then every path is listed in order', () => {
    const sut = parseRulingLine;

    const result = sut('- R-902 [a/**, b/*.md, c.js] Stated.', 1);

    assert.deepEqual(result.ruling.paths, ['a/**', 'b/*.md', 'c.js']);
  });

  it('Given a line with refused items, when parsed, then the items are split on the item separator', () => {
    const sut = parseRulingLine;

    const result = sut('- R-903 [] Stated. Refused: first option · second option.', 1);

    assert.equal(result.ruling.statement, 'Stated');
    assert.deepEqual(result.ruling.refused, ['first option', 'second option']);
  });

  it('Given a line with an adoption basis, when parsed, then the basis is captured', () => {
    const sut = parseRulingLine;

    const result = sut('- R-904 [] Stated. Adopted: adopted as recommended.', 1);

    assert.equal(result.ruling.adopted, 'adopted as recommended');
  });

  it('Given a superseded line, when parsed, then the status carries the successor and the scope', () => {
    const sut = parseRulingLine;

    const result = sut('- R-905 [] Stated. Superseded by R-906: the retry rule.', 1);

    assert.deepEqual(result.ruling.status, { kind: 'superseded', by: 906, scope: 'the retry rule' });
  });

  it('Given a rejected line, when parsed, then the status carries the reason', () => {
    const sut = parseRulingLine;

    const result = sut('- R-907 [] Stated. Rejected: not worth it.', 1);

    assert.deepEqual(result.ruling.status, { kind: 'rejected', reason: 'not worth it' });
  });

  it('Given a line with every optional segment, when parsed, then all segments are captured', () => {
    const sut = parseRulingLine;

    const result = sut('- R-908 [x/**] Stated. Refused: a · b. Adopted: by review. Superseded by R-909: all of it.', 1);

    assert.deepEqual(result.ruling.refused, ['a', 'b']);
    assert.equal(result.ruling.adopted, 'by review');
    assert.deepEqual(result.ruling.status, { kind: 'superseded', by: 909, scope: 'all of it' });
  });

  it('Given a statement holding dots, semicolons and pipes, when parsed, then the statement is kept whole', () => {
    const sut = parseRulingLine;

    const result = sut('- R-910 [] Use a.b; c | d. Then e.', 1);

    assert.equal(result.ruling.statement, 'Use a.b; c | d. Then e');
  });

  const refusals = [
    ['markers are out of order', '- R-911 [] S. Adopted: x. Refused: a.'],
    ['a marker repeats', '- R-911 [] S. Refused: a. Refused: b.'],
    ['superseded and rejected are both present', '- R-911 [] S. Superseded by R-912: x. Rejected: y.'],
    ['an item is empty', '- R-911 [] S. Refused: a ·  · b.'],
    ['a scope is empty', '- R-911 [] S. Superseded by R-912: .'],
    ['a reason is empty', '- R-911 [] S. Rejected: .'],
    ['a basis is empty', '- R-911 [] S. Adopted: .'],
    ['the statement is empty', '- R-911 []  Refused: a.'],
    ['the id has fewer than three digits', '- R-12 [] S.'],
    ['the path list is missing', '- R-911 S.'],
    ['the superseding id is malformed', '- R-911 [] S. Superseded by R-x: y.'],
  ];
  for (const [name, line] of refusals) {
    it(`Given a line where ${name}, when parsed, then it returns an error carrying the line number`, () => {
      const sut = parseRulingLine;

      const result = sut(line, 7);

      assert.equal(result.ruling, undefined);
      assert.equal(result.error.line, 7);
      assert.ok(result.error.message.length > 0);
    });
  }
});

const SEED = 20240607;
const ALPHABET = ['alpha', 'b.c', 'x;y', 'p|q', 'one two', 'Zed', '42', 'a-b'];
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const LCG_MODULUS = 2 ** 32;
const GENERATED_LINES = 200;

function makeRandom(seed) {
  let state = seed;
  return (bound) => {
    state = (state * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return Math.floor((state / LCG_MODULUS) * bound);
  };
}

function makeText(random) {
  const words = Array.from({ length: 1 + random(4) }, () => ALPHABET[random(ALPHABET.length)]);
  return words.join(' ');
}

function makeList(random, separator) {
  return Array.from({ length: 1 + random(3) }, () => makeText(random)).join(separator);
}

function makeLine(random) {
  const id = String(random(1000)).padStart(3, '0');
  const paths = random(3) === 0 ? '' : makeList(random, ', ').replaceAll(' ', '-');
  const parts = [`- R-${id} [${paths}] ${makeText(random)}.`];
  if (random(2)) parts.push(` Refused: ${makeList(random, ' · ')}.`);
  if (random(2)) parts.push(` Adopted: ${makeText(random)}.`);
  const status = random(3);
  if (status === 1) parts.push(` Superseded by R-${String(random(1000)).padStart(3, '0')}: ${makeText(random)}.`);
  if (status === 2) parts.push(` Rejected: ${makeText(random)}.`);
  return parts.join('');
}

describe('formatRulingLine', () => {
  it('Given generated valid lines, when each is parsed then formatted, then it round-trips byte-exact', () => {
    const random = makeRandom(SEED);
    const sut = formatRulingLine;

    for (let i = 0; i < GENERATED_LINES; i++) {
      const line = makeLine(random);
      const result = sut(parseRulingLine(line, i + 1).ruling);

      assert.equal(result, line);
    }
  });

  it('Given an id below one hundred, when formatted, then the id is zero-padded to three digits', () => {
    const ruling = parseRulingLine('- R-007 [] S.', 1).ruling;
    const sut = formatRulingLine;

    const result = sut(ruling);

    assert.equal(result, '- R-007 [] S.');
  });
});

describe('parseRegister', () => {
  it('Given the header and two ruling lines, when parsed, then both rulings come back with their file line numbers', () => {
    const content = `${REGISTER_HEADER}- R-901 [] One.\n- R-902 [a/**] Two.\n`;
    const headerLines = REGISTER_HEADER.split('\n').length - 1;
    const sut = parseRegister;

    const result = sut(content);

    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.rulings.map((r) => [r.id, r.line]), [[901, headerLines + 1], [902, headerLines + 2]]);
  });

  it('Given a prose line after the first ruling, when parsed, then it is reported as not a ruling line', () => {
    const content = `${REGISTER_HEADER}- R-901 [] One.\nstray prose\n`;
    const sut = parseRegister;

    const result = sut(content);

    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /not a ruling line/);
    assert.equal(result.rulings.length, 1);
  });

  it('Given blank lines between rulings, when parsed, then they are ignored', () => {
    const content = `${REGISTER_HEADER}- R-901 [] One.\n\n- R-902 [] Two.\n\n`;
    const sut = parseRegister;

    const result = sut(content);

    assert.deepEqual(result.errors, []);
    assert.equal(result.rulings.length, 2);
  });

  it('Given only the header and intro, when parsed, then the register is valid and empty', () => {
    const sut = parseRegister;

    const result = sut(REGISTER_HEADER);

    assert.deepEqual(result, { rulings: [], errors: [] });
  });

  it('Given a malformed ruling line, when parsed, then the error names its line', () => {
    const content = `${REGISTER_HEADER}- R-12 [] One.\n`;
    const sut = parseRegister;

    const result = sut(content);

    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].line, REGISTER_HEADER.split('\n').length);
  });
});

describe('REGISTER_HEADER', () => {
  it('Given the constant, when read, then it is the H1 and the intro naming the lint and the doctrine', () => {
    const sut = REGISTER_HEADER;

    assert.ok(sut.startsWith('# Rulings\n\n'));
    assert.ok(sut.includes('`rulings-lint`'));
    assert.ok(sut.includes('`DOCTRINE.md`'));
    assert.ok(sut.endsWith('code.\n\n'));
  });
});

describe('sliceRulings', () => {
  const rulings = [
    '- R-901 [src/**] Matches.',
    '- R-902 [docs/**, src/a.js] Also matches. Superseded by R-903: all.',
    '- R-903 [src/**] Rejected one. Rejected: no.',
    '- R-904 [other/**] Misses.',
    '- R-905 [] Pathless.',
  ].map((line, i) => parseRulingLine(line, i + 1).ruling);

  it('Given touched paths, when sliced, then matching rulings come back in id order, superseded and rejected included', () => {
    const sut = sliceRulings;

    const result = sut(rulings, ['src/a.js']);

    assert.deepEqual(result.matched.map((r) => r.id), [901, 902, 903]);
  });

  it('Given pathless rulings, when sliced, then they are never matched and are counted', () => {
    const sut = sliceRulings;

    const result = sut(rulings, ['src/a.js']);

    assert.equal(result.pathless, 1);
  });

  it('Given duplicate touched paths, when sliced, then the output holds no duplicate', () => {
    const sut = sliceRulings;

    const result = sut(rulings, ['src/a.js', 'src/a.js']);

    assert.deepEqual(result.matched.map((r) => r.id), [901, 902, 903]);
  });

  it('Given no touched path, when sliced, then nothing matches', () => {
    const sut = sliceRulings;

    const result = sut(rulings, []);

    assert.deepEqual(result.matched, []);
  });
});
