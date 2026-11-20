import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/doctrine-lint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;
const DOCTRINE = 'doctrine.md';
const REGISTER = 'register.md';
const USAGE = 'usage: doctrine-lint <doctrine-file> <register-file>\n';

const entry = (id, overrides = {}) => {
  const bullets = {
    Trigger: 'a trigger',
    Rule: 'a rule',
    Evidence: 'R-546 — why',
    'Counter-cases': 'none',
    ...overrides,
  };
  const lines = Object.entries(bullets).map(([k, v]) => `- **${k}:** ${v}`);
  return [`## D-${id} — Title ${id}`, ...lines].join('\n');
};

const line = (id, tail = '') => `- R-${id} [] A statement.${tail}`;
const register = (...lines) => `# Rulings\n\n${lines.join('\n')}\n`;

const WORK = '/work';
const sut = main;

function run(argv, { doctrine = '', registerText = register(line(546)), isFile = true, registerIsFile = true } = {}) {
  const io = makeCaptureIo();
  const deps = {
    cwd: () => WORK,
    isFile: (p) => (p === `${WORK}/${DOCTRINE}` && isFile) || (p === `${WORK}/${REGISTER}` && registerIsFile),
    readFile: (p) => {
      if (p === `${WORK}/${DOCTRINE}`) return doctrine;
      if (p === `${WORK}/${REGISTER}`) return registerText;
      throw new Error(`unexpected read ${p}`);
    },
  };
  const code = sut(argv, io, deps);
  return { code, out: io.stdout.joined(), err: io.stderr.joined() };
}

describe('doctrine-lint main', () => {
  it('Given no arguments, when main runs, then it writes the usage line to stderr and returns 2', () => {
    const argv = [];

    const result = run(argv);

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.err, USAGE);
  });

  it('Given three arguments, when main runs, then it writes the usage line to stderr and returns 2', () => {
    const argv = [DOCTRINE, REGISTER, 'extra'];

    const result = run(argv);

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.err, USAGE);
  });

  it('Given an absent doctrine file, when main runs, then it reports no such file and returns 2', () => {
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { isFile: false });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: no such file ${DOCTRINE}\n`);
  });

  it('Given a register that is not a file, when main runs, then it reports no such file and returns 2', () => {
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { registerIsFile: false });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: no such file ${REGISTER}\n`);
  });

  it('Given a doctrine citing a ruling the register holds, when main runs, then it prints the OK line naming ruling citations and returns 0', () => {
    const doctrine = `${entry(1, { Evidence: 'R-901 — why' })}\n`;
    const registerText = register(line(901));
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine, registerText });

    assert.equal(result.code, EXIT_OK);
    assert.equal(result.out, 'doctrine-lint: 1 entries, 1 ruling citations — OK\n');
  });

  it('Given evidence and counter-case citations, when main runs, then both are counted', () => {
    const doctrine = `${entry(1, { 'Counter-cases': 'R-902 — why' })}\n`;
    const registerText = register(line(546), line(902));
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine, registerText });

    assert.equal(result.out, 'doctrine-lint: 1 entries, 2 ruling citations — OK\n');
  });

  it('Given a doctrine with a malformed heading, when main runs, then it prints the parser error with file and line and returns 2', () => {
    const doctrine = '# Doctrine\n\n## nonsense\n';
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:3: heading must be "## D-<n> — <title>"\n`);
  });

  it('Given an evidence id with no register line, when main runs, then it reports it does not resolve and returns 2', () => {
    const doctrine = `${entry(1, { Evidence: 'R-901 — why' })}\n`;
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: R-901 does not resolve\n`);
  });

  it('Given a cited ruling that is superseded, when main runs, then it reports it is superseded', () => {
    const doctrine = `${entry(1, { Evidence: 'R-901 — why' })}\n`;
    const registerText = register(line(901, ' Superseded by R-902: the whole ruling.'), line(902));
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine, registerText });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: R-901 is superseded\n`);
  });

  it('Given a counter-case ruling that is superseded, when main runs, then it reports it is superseded', () => {
    const doctrine = `${entry(1, { Evidence: 'R-902 — why', 'Counter-cases': 'R-901 — exception' })}\n`;
    const registerText = register(line(901, ' Superseded by R-902: the whole ruling.'), line(902));
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine, registerText });

    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: R-901 is superseded\n`);
  });

  it('Given a cited ruling that is rejected, when main runs, then it resolves', () => {
    const doctrine = `${entry(1, { Evidence: 'R-901 — why' })}\n`;
    const registerText = register(line(901, ' Rejected: reverted after measurement.'));
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine, registerText });

    assert.equal(result.code, EXIT_OK);
  });

  it('Given an adoption basis naming DOCTRINE(D-9) and no D-9 entry, when main runs, then it reports the orphan at the register line', () => {
    const doctrine = `${entry(1)}\n`;
    const registerText = register(line(546), line(547, ' Adopted: DOCTRINE(D-9).'));
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine, registerText });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${REGISTER}:4: DOCTRINE(D-9) names no entry\n`);
  });

  it('Given an adoption basis naming an existing entry, when main runs, then it reports nothing', () => {
    const doctrine = `${entry(1)}\n`;
    const registerText = register(line(546, ' Adopted: DOCTRINE(D-1).'));
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine, registerText });

    assert.equal(result.code, EXIT_OK);
  });

  it('Given a basis holding only the placeholder DOCTRINE(D-n), when main runs, then it reports nothing', () => {
    const doctrine = `${entry(1)}\n`;
    const registerText = register(line(546, ' Adopted: DOCTRINE(D-n) and DOCTRINE(D-<n>).'));
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine, registerText });

    assert.equal(result.code, EXIT_OK);
  });

  it('Given a register with a malformed line, when main runs, then the parse error is a finding at that line', () => {
    const doctrine = `${entry(1)}\n`;
    const registerText = register(line(546), '- nonsense');
    const argv = [DOCTRINE, REGISTER];

    const result = run(argv, { doctrine, registerText });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${REGISTER}:4: not a ruling line\n`);
  });
});
