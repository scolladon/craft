import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/rulings-hint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const REGISTER_FILE = 'docs/RULINGS.md';
const MATCHING = '- R-900 [src/a.js] Keep a settled.';
const PATHLESS = '- R-901 [] Keep b settled.';
const HEADER = 'Rulings (settled for these paths — a proposal that re-opens one escalates):';

const registerOf = (...lines) => `# Rulings\n\n${lines.join('\n')}\n`;

function run({ argv = ['--register', REGISTER_FILE], register, stdin = '' }) {
  const io = makeCaptureIo();
  const deps = {
    readFile: () => {
      if (register === undefined) throw new Error('ENOENT: no such file');
      return register;
    },
    readStdin: () => stdin,
  };
  const code = main(argv, io, deps);
  return { code, out: io.stdout.joined(), err: io.stderr.joined() };
}

test('Given one matching and one path-less ruling, When a touched path matches, Then header, line and tail are printed', () => {
  const register = registerOf(MATCHING, PATHLESS);

  const result = run({ register, stdin: 'src/a.js\n' });

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    `${HEADER}\n${MATCHING}\n(1 rulings carry no paths — search ${REGISTER_FILE} by topic)\n`,
  );
});

test('Given a register, When no ruling matches and none is path-less, Then nothing is printed', () => {
  const register = registerOf(MATCHING);

  const result = run({ register, stdin: 'src/other.js\n' });

  assert.deepEqual(result, { code: 0, out: '', err: '' });
});

test('Given only path-less rulings, When no ruling matches, Then nothing is printed', () => {
  const register = registerOf(PATHLESS);

  const result = run({ register, stdin: 'src/a.js\n' });

  assert.equal(result.out, '');
});

test('Given no path-less ruling, When a ruling matches, Then the tail line is absent', () => {
  const register = registerOf(MATCHING);

  const result = run({ register, stdin: 'src/a.js\n' });

  assert.equal(result.out, `${HEADER}\n${MATCHING}\n`);
});

test('Given superseded and rejected rulings, When their path is touched, Then their raw lines print verbatim in id order', () => {
  const superseded = '- R-902 [src/a.js] Old way. Superseded by R-903: whole.';
  const later = '- R-903 [src/a.js] New way.';
  const rejected = '- R-904 [src/a.js] Odd way. Rejected: not needed.';
  const register = registerOf(superseded, later, rejected);

  const result = run({ register, stdin: 'src/a.js\n' });

  assert.equal(result.out, `${HEADER}\n${superseded}\n${later}\n${rejected}\n`);
});

test('Given blank and duplicate stdin lines, When the slice is built, Then each path counts once and the ruling prints once', () => {
  const register = registerOf(MATCHING);

  const result = run({ register, stdin: '\nsrc/a.js\n\n  src/a.js  \n' });

  assert.equal(result.out, `${HEADER}\n${MATCHING}\n`);
});

test('Given a missing register, When main runs, Then a stderr note is written and the exit is 0', () => {
  const sut = run({ register: undefined, stdin: 'src/a.js\n' });

  assert.deepEqual(sut, { code: 0, out: '', err: 'craft-rulings-hint: ENOENT: no such file\n' });
});

test('Given a register with a parse error, When main runs, Then a stderr note names the line and the exit is 0', () => {
  const register = registerOf(MATCHING, '- R-905 broken');

  const result = run({ register, stdin: 'src/a.js\n' });

  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  assert.match(result.err, /^craft-rulings-hint: .*line/);
});

for (const argv of [[], ['--register'], ['--other', 'x'], ['--register', 'a', '--bogus']]) {
  test(`Given the arguments ${JSON.stringify(argv)}, When main runs, Then usage goes to stderr and the exit is 2`, () => {
    const result = run({ argv, register: registerOf(MATCHING) });

    assert.deepEqual(result, { code: 2, out: '', err: 'usage: rulings-hint --register <file>\n' });
  });
}
