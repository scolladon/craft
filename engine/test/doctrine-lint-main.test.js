import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/doctrine-lint-main.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const EXIT_OK = 0;
const EXIT_INVALID = 2;
const DOCTRINE = 'doctrine.md';
const ADR_DIR = 'adr';
const USAGE = 'usage: doctrine-lint <doctrine-file> <adr-dir>\n';

const entry = (id, overrides = {}) => {
  const bullets = {
    Trigger: 'a trigger',
    Rule: 'a rule',
    Evidence: 'ADR-546 — why',
    'Counter-cases': 'none',
    ...overrides,
  };
  const lines = Object.entries(bullets).map(([k, v]) => `- **${k}:** ${v}`);
  return [`## D-${id} — Title ${id}`, ...lines].join('\n');
};

const adr = (status = 'accepted') => `# ADR\n\n- **Status:** ${status}\n`;

const WORK = '/work';
const sut = main;

function run(argv, { doctrine = '', adrs = {}, isFile = true, isDirectory = true, nonRegular = [] } = {}) {
  const io = makeCaptureIo();
  const adrPath = (name) => `${WORK}/${ADR_DIR}/${name}`;
  const deps = {
    cwd: () => WORK,
    isFile: (p) => p === `${WORK}/${DOCTRINE}` && isFile,
    isDirectory: (p) => p === `${WORK}/${ADR_DIR}` && isDirectory,
    isRegularEntry: (p) => !nonRegular.some((name) => p === adrPath(name)),
    readFile: (p) => {
      if (p === `${WORK}/${DOCTRINE}`) return doctrine;
      const name = Object.keys(adrs).find((candidate) => p === adrPath(candidate));
      if (name === undefined) throw new Error(`unexpected read ${p}`);
      return adrs[name];
    },
    listDir: (p) => {
      if (p !== `${WORK}/${ADR_DIR}`) throw new Error(`unexpected list ${p}`);
      return Object.keys(adrs);
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
    const argv = [DOCTRINE, ADR_DIR, 'extra'];

    const result = run(argv);

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.err, USAGE);
  });

  it('Given an absent doctrine file, when main runs, then it reports no such file and returns 2', () => {
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { isFile: false });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: no such file ${DOCTRINE}\n`);
  });

  it('Given an absent ADR dir, when main runs, then it reports no such directory and returns 2', () => {
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { isDirectory: false });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: no such directory ${ADR_DIR}\n`);
  });

  it('Given a valid two-entry doctrine citing live ADRs, when main runs, then it prints the OK line and returns 0', () => {
    const doctrine = `# Doctrine\n\n${entry(1)}\n\n${entry(2, { Evidence: 'ADR-546 — a, ADR-101 — b' })}\n`;
    const adrs = { '546-a.md': adr(), '101-b.md': adr() };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_OK);
    assert.equal(result.out, 'doctrine-lint: 2 entries, 3 ADR citations — OK\n');
  });

  it('Given evidence and counter-case citations, when main runs, then both are counted', () => {
    const doctrine = `${entry(1, { 'Counter-cases': 'ADR-101 — why' })}\n`
    const adrs = { '546-a.md': adr(), '101-b.md': adr() };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.out, 'doctrine-lint: 1 entries, 2 ADR citations — OK\n');
  });

  it('Given an ADR holding DOCTRINE(D-10) and no D-10 entry, when main runs, then it reports the orphan citation', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.md': `${adr()}\nSee DOCTRINE(D-10).\n` };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.out, `doctrine-lint: ${ADR_DIR}/546-a.md: DOCTRINE(D-10) names no entry\n`);
  });

  it('Given a doctrine with a malformed heading, when main runs, then it prints the parser error with file and line and returns 2', () => {
    const doctrine = '# Doctrine\n\n## nonsense\n';
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:3: heading must be "## D-<n> — <title>"\n`);
  });

  it('Given an evidence id with no ADR file, when main runs, then it reports it does not resolve and returns 2', () => {
    const doctrine = `${entry(1)}\n`;
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs: {} });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: ADR-546 does not resolve\n`);
  });

  it('Given two files sharing the prefix 546-, when main runs, then it reports the id does not resolve', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.md': adr(), '546-b.md': adr() };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: ADR-546 does not resolve\n`);
  });

  it('Given a non-markdown file with the prefix, when main runs, then it is ignored and the id does not resolve', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.txt': adr() };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: ADR-546 does not resolve\n`);
  });

  it('Given a cited file whose Status is superseded, when main runs, then it reports it is superseded', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.md': adr('superseded by ADR-009') };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: ADR-546 is superseded\n`);
  });

  it('Given a counter-case id that is superseded, when main runs, then it reports it is superseded', () => {
    const doctrine = `${entry(1, { 'Counter-cases': 'ADR-101 — exception' })}\n`;
    const adrs = { '546-a.md': adr(), '101-b.md': adr('superseded by ADR-009') };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: ADR-101 is superseded\n`);
  });

  it('Given an ADR mentioning superseded only outside its Status line, when main runs, then it is live', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.md': '# ADR\n\nsuperseded in prose\n\n- **Status:** accepted\n' };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_OK);
  });

  it('Given an ADR holding DOCTRINE(D-9) and no D-9 entry, when main runs, then it reports the orphan citation and returns 2', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.md': `${adr()}\nSee DOCTRINE(D-9).\n` };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${ADR_DIR}/546-a.md: DOCTRINE(D-9) names no entry\n`);
  });

  it('Given DOCTRINE(D-1) inside a fenced block of an ADR and no D-1 entry, when main runs, then it is still a finding', () => {
    const doctrine = `${entry(2)}\n`;
    const adrs = { '546-a.md': `${adr()}\n\`\`\`\nDOCTRINE(D-1)\n\`\`\`\n` };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${ADR_DIR}/546-a.md: DOCTRINE(D-1) names no entry\n`);
  });

  it('Given an ADR citing an existing entry, when main runs, then it reports nothing', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.md': `${adr()}\nDOCTRINE(D-1)\n` };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_OK);
  });

  it('Given an ADR holding only the placeholder DOCTRINE(D-n), when main runs, then it reports nothing and returns 0', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.md': `${adr()}\nDOCTRINE(D-n) and DOCTRINE(D-<n>)\n` };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_OK);
    assert.equal(result.out, 'doctrine-lint: 1 entries, 1 ADR citations — OK\n');
  });
  it('Given only a file whose id is longer than the cited id, when main runs, then the cited id does not resolve', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '5460-a.md': adr() };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: ADR-546 does not resolve\n`);
  });

  it('Given a cited ADR whose Status line is indented and superseded, when main runs, then it reports it is superseded', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.md': '# ADR\n\n  - **Status:** superseded by a later record\n' };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(result.out, `doctrine-lint: ${DOCTRINE}:1: D-1: ADR-546 is superseded\n`);
  });

  it('Given orphan citations in ADRs listed out of name order, when main runs, then findings come in name order', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '700-b.md': `${adr()}\nDOCTRINE(D-8)\n`, '546-a.md': adr(), '600-a.md': `${adr()}\nDOCTRINE(D-7)\n` };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs });

    assert.equal(result.code, EXIT_INVALID);
    assert.equal(
      result.out,
      `doctrine-lint: ${ADR_DIR}/600-a.md: DOCTRINE(D-7) names no entry\ndoctrine-lint: ${ADR_DIR}/700-b.md: DOCTRINE(D-8) names no entry\n`,
    );
  });

  it('Given an ADR-named entry that is not a regular file, when main runs, then it is neither read nor resolved', () => {
    const doctrine = `${entry(1)}\n`;
    const adrs = { '546-a.md': adr(), '546-link.md': `${adr()}\nDOCTRINE(D-9)\n` };
    const argv = [DOCTRINE, ADR_DIR];

    const result = run(argv, { doctrine, adrs, nonRegular: ['546-link.md'] });

    assert.equal(result.code, EXIT_OK);
    assert.equal(result.out, 'doctrine-lint: 1 entries, 1 ADR citations — OK\n');
  });
});
