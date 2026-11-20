import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/rulings-lint-main.js';
import { REGISTER_HEADER } from '../src/rulings.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;
const WORK = '/work';
const REGISTER = 'RULINGS.md';
const USAGE = 'usage: rulings-lint <register-file>\n';

const register = (...lines) => `${REGISTER_HEADER}${lines.join('\n')}\n`;

function run(argv, { content = register(), isRegularFile = true } = {}) {
  const io = makeCaptureIo();
  const deps = {
    cwd: () => WORK,
    isRegularFile: (p) => p === `${WORK}/${REGISTER}` && isRegularFile,
    readFile: (p) => {
      if (p !== `${WORK}/${REGISTER}`) throw new Error(`unexpected read ${p}`);
      return content;
    },
  };
  const code = main(argv, io, deps);
  return { code, stdout: io.stdout.joined(), stderr: io.stderr.joined() };
}

const findingsOf = (content) => run([REGISTER], { content });
const expectFinding = (result, line, message) => {
  assert.equal(result.code, EXIT_INVALID);
  assert.ok(
    result.stdout.includes(`rulings-lint: ${REGISTER}:${line}: ${message}\n`),
    `stdout: ${result.stdout}`,
  );
};

describe('rulings-lint main', () => {
  const sut = run;

  it('Given no argument, when main runs, then usage goes to stderr and it exits 2', () => {
    const result = sut([]);

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.stderr, USAGE);
    assert.equal(result.stdout, '');
  });

  it('Given two arguments, when main runs, then usage goes to stderr and it exits 2', () => {
    const result = sut([REGISTER, 'extra']);

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.stderr, USAGE);
  });

  it('Given a missing file, when main runs, then it reports no such file on stdout and exits 2', () => {
    const result = sut([REGISTER], { isRegularFile: false });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.stdout, `rulings-lint: no such file ${REGISTER}\n`);
  });

  it('Given a clean register, when main runs, then it prints the count and exits 0', () => {
    const content = register('- R-001 [a/**] First.', '- R-002 [] Second.');

    const result = sut([REGISTER], { content });

    assert.equal(result.code, EXIT_OK);
    assert.equal(result.stdout, 'rulings-lint: 2 rulings — OK\n');
  });

  it('Given an empty register, when main runs, then it is clean with zero rulings', () => {
    const result = sut([REGISTER]);

    assert.equal(result.code, EXIT_OK);
    assert.equal(result.stdout, 'rulings-lint: 0 rulings — OK\n');
  });

  it('Given a malformed ruling line, when main runs, then it reports the parse error with its line', () => {
    const result = findingsOf(register('- R-001 [] First.', '- R-12 [] Bad.'));

    expectFinding(result, 8, 'not a ruling line: expected "- R-NNN [paths] statement."');
  });

  it('Given a repeated id, when main runs, then it reports a duplicate id', () => {
    const result = findingsOf(register('- R-001 [] First.', '- R-001 [] Again.'));

    expectFinding(result, 8, 'duplicate id R-001');
  });

  it('Given a smaller id after a larger one, when main runs, then it reports out of order', () => {
    const result = findingsOf(register('- R-005 [] First.', '- R-003 [] Second.'));

    expectFinding(result, 8, 'R-003 out of order');
  });

  it('Given ascending ids with gaps, when main runs, then order is clean', () => {
    const result = findingsOf(register('- R-001 [] First.', '- R-009 [] Second.'));

    assert.equal(result.code, EXIT_OK);
  });

  const PATH_MESSAGE = (path) => `path "${path}" must be repo-relative, canonical, without whitespace, "..", "~", "," or brackets`;
  for (const path of ['/etc/x', '~/x', 'a/../b', 'a,b', 'a[b', 'src//b.js', './src/a.js', 'src/./a.js', 'src/a/']) {
    it(`Given the path ${path}, when main runs, then it reports the path`, () => {
      const result = findingsOf(register(`- R-001 [${path}] First.`));

      expectFinding(result, 7, PATH_MESSAGE(path));
    });
  }

  it('Given a path holding a space, when main runs, then it reports the path', () => {
    const result = findingsOf(register('- R-001 [a b/x] First.'));

    expectFinding(result, 7, PATH_MESSAGE('a b/x'));
  });

  for (const [name, paths] of [['a trailing empty path', 'a, '], ['an inner empty path', 'a, , b']]) {
    it(`Given ${name}, when main runs, then it reports the empty path`, () => {
      const result = findingsOf(register(`- R-001 [${paths}] First.`));

      expectFinding(result, 7, PATH_MESSAGE(''));
    });
  }

  it('Given a path holding a double dot inside a segment, when main runs, then it is clean', () => {
    const result = findingsOf(register('- R-001 [a..b/x] First.'));

    assert.equal(result.code, EXIT_OK);
  });

  it('Given a relative glob path, when main runs, then it is clean', () => {
    const result = findingsOf(register('- R-001 [engine/src/**, docs/*.md] First.'));

    assert.equal(result.code, EXIT_OK);
  });

  it('Given a supersession naming a missing ruling, when main runs, then it reports it', () => {
    const result = findingsOf(register('- R-001 [] First. Superseded by R-009: all.'));

    expectFinding(result, 7, 'superseded by R-009 which has no line');
  });

  it('Given a supersession by a smaller id, when main runs, then it reports it', () => {
    const result = findingsOf(register('- R-001 [] First.', '- R-002 [] Second. Superseded by R-001: all.'));

    expectFinding(result, 8, 'superseded by R-001 which is not a later ruling');
  });

  it('Given a ruling superseded by itself, when main runs, then it reports it as not a later ruling', () => {
    const result = findingsOf(register('- R-001 [] First. Superseded by R-001: all.'));

    expectFinding(result, 7, 'superseded by R-001 which is not a later ruling');
  });

  it('Given a supersession by a superseded ruling, when main runs, then it reports it', () => {
    const result = findingsOf(register(
      '- R-001 [] First. Superseded by R-002: all.',
      '- R-002 [] Second. Superseded by R-003: all.',
      '- R-003 [] Third.',
    ));

    expectFinding(result, 7, 'superseded by R-002 which is itself superseded');
  });

  it('Given a supersession by a live later ruling, when main runs, then it is clean', () => {
    const result = findingsOf(register('- R-001 [] First. Superseded by R-002: all.', '- R-002 [] Second.'));

    assert.equal(result.code, EXIT_OK);
  });

  it('Given an adoption basis naming a missing ruling, when main runs, then it reports it', () => {
    const result = findingsOf(register('- R-001 [] First. Adopted: follows R-777.'));

    expectFinding(result, 7, 'adoption basis names R-777 which has no line');
  });

  it('Given an adoption basis naming a two-digit ruling id, when main runs, then it is not checked as a ruling reference', () => {
    const result = findingsOf(register('- R-001 [] First. Adopted: follows R-12.'));

    assert.equal(result.code, EXIT_OK);
  });

  it('Given an adoption basis naming a superseded ruling, when main runs, then it is clean', () => {
    const result = findingsOf(register(
      '- R-001 [] First. Superseded by R-003: all.',
      '- R-002 [] Second. Adopted: follows R-001.',
      '- R-003 [] Third.',
    ));

    assert.equal(result.code, EXIT_OK);
  });

  it('Given a doctrine basis, when main runs, then it is not checked as a ruling reference', () => {
    const result = findingsOf(register('- R-001 [] First. Adopted: DOCTRINE(D-4).'));

    assert.equal(result.code, EXIT_OK);
  });

  it('Given a semantic finding before a parse error, when main runs, then the output follows line order', () => {
    const result = findingsOf(register('- R-001 [/abs] First.', '- R-12 [] Bad.'));

    assert.equal(result.stdout, [
      `rulings-lint: ${REGISTER}:7: ${PATH_MESSAGE('/abs')}`,
      `rulings-lint: ${REGISTER}:8: not a ruling line: expected "- R-NNN [paths] statement."`,
      '',
    ].join('\n'));
  });

  it('Given a register missing the H1, when main runs, then it reports line 1 and exits 2', () => {
    const result = findingsOf('intro\n\n- R-001 [] First.\n');

    expectFinding(result, 1, 'the register must start with "# Rulings"');
  });

  it('Given a statement holding an escape sequence, when main runs, then it reports the control character, escaped', () => {
    const result = findingsOf(register('- R-001 [] Use \u001b[31mMARKER\u001b[0m here.'));

    expectFinding(result, 7, 'control character in ruling line');
    assert.ok(!result.stdout.includes('\u001b'));
  });

  it('Given a label holding a control character, when main runs, then it is printed escaped', () => {
    const io = makeCaptureIo();
    const deps = { cwd: () => WORK, isRegularFile: () => false, readFile: () => '' };

    main(['a\u001bb.md'], io, deps);

    assert.equal(io.stdout.joined(), 'rulings-lint: no such file a\\x1bb.md\n');
  });
});
