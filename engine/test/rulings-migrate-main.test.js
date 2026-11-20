import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/rulings-migrate-main.js';
import { REGISTER_HEADER } from '../src/rulings.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const EM_DASH = '—';

function adr({ id, title = `Title ${id}`, status = 'accepted', options = [], decision = ['Settled.'], decisionHeading = '## Decision', frontmatter = '' }) {
  const optionBlock = options.length ? ['## Options considered', '', ...options, ''] : [];
  return [
    ...(frontmatter ? [frontmatter] : []),
    `# ${id} ${EM_DASH} ${title}`,
    '',
    `- **Status:** ${status}`,
    '',
    ...optionBlock,
    decisionHeading,
    '',
    ...decision,
    '',
  ].join('\n');
}

function run(files, extra = []) {
  const io = makeCaptureIo();
  const deps = {
    cwd: () => '/work',
    listDir: () => Object.keys(files),
    readFile: (p) => files[p.split('/').pop()],
    isRegularEntry: () => true,
  };
  const code = main(['register', 'adr', ...extra], io, deps);
  return { code, out: io.stdout.joined(), err: io.stderr.joined() };
}

const TWO_OPTIONS = ['1. **Alpha** *(recommended)* — a', '2. **Beta** — b'];
const line = (rest) => `${REGISTER_HEADER}${rest}\n`;

test('Given one ratified ADR with two options, when register runs, then it prints the header and a refused line', () => {
  const sut = run;

  const result = sut({ '901-one.md': adr({ id: 901, options: TWO_OPTIONS }) });

  assert.equal(result.code, 0);
  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Beta.'));
});

test('Given ADRs out of order, when register runs, then lines come in id order', () => {
  const sut = run;

  const result = sut({ '902-b.md': adr({ id: 902 }), '901-a.md': adr({ id: 901 }) });

  assert.equal(result.out, line('- R-901 [] Title 901.\n- R-902 [] Title 902.'));
});

test('Given no argument, when main runs, then it prints usage and exits 2', () => {
  const io = makeCaptureIo();

  const code = main([], io, {});

  assert.equal(code, 2);
  assert.match(io.stderr.joined(), /^usage: rulings-migrate/);
});

test('Given a fenced ADR with subjects, when register runs, then the paths are listed in file order', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, frontmatter: "---\nsubjects: ['b/**', 'a.md']\n---" }) });

  assert.equal(result.out, line('- R-901 [b/**, a.md] Title 901.'));
});

test('Given a fenced ADR without subjects, when register runs, then the paths are empty', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, frontmatter: '---\nother: 1\n---' }) });

  assert.equal(result.out, line('- R-901 [] Title 901.'));
});

test('Given malformed frontmatter, when register runs, then it refuses', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, frontmatter: '---\nsubjects: [a\n---' }) });

  assert.equal(result.code, 2);
  assert.equal(result.out, '');
  assert.match(result.err, /^rulings-migrate: refuse 901: /);
});

test('Given subjects that are not a string list, when register runs, then it refuses', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, frontmatter: "---\nsubjects: ['']\n---" }) });

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: /);
});

test('Given an H1 number differing from the filename, when register runs, then it refuses', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 905 }) });

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: /);
});

test('Given an ADR without H1, when register runs, then it refuses', () => {
  const sut = run;

  const result = sut({ '901-a.md': 'no heading\n' });

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: /);
});

test('Given a repeated id, when register runs, then it refuses', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901 }), '901-b.md': adr({ id: 901 }) });

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: /);
});

test('Given a title holding a reserved marker, when register runs, then it refuses', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, title: 'Use X Refused: Y' }) });

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: /);
});

test('Given two refusing ADRs, when register runs, then both are reported', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 905 }), '902-b.md': adr({ id: 906 }) });

  assert.deepEqual(result.err.split('\n').filter(Boolean).map((l) => l.slice(0, 29)), [
    'rulings-migrate: refuse 901: ',
    'rulings-migrate: refuse 902: ',
  ]);
});

test('Given the Status line form, when register runs, then Adopted carries the default basis', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, status: 'accepted — adopted-as-recommended (no user judgment)' }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: as recommended.'));
});

test('Given the Decision heading form, when register runs, then Adopted carries the default basis', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, decisionHeading: '## Decision — *adopted-as-recommended (no user judgment)*' }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: as recommended.'));
});

test('Given the Decision lead form with a basis citing an id, when register runs, then the id is rewritten', () => {
  const sut = run;
  const lead = ['**adopted-as-recommended (no user judgment)** — follows ADR-905', 'and more.'];

  const result = sut({ '901-a.md': adr({ id: 901, decision: lead }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: follows R-905 and more.'));
});

test('Given the Decision lead form without basis, when register runs, then the default basis is used', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, decision: ['**adopted-as-recommended (no user judgment)**'] }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: as recommended.'));
});

test('Given the two review-adopted statuses, when register runs, then each carries its basis', () => {
  const sut = run;

  const result = sut({
    '901-a.md': adr({ id: 901, status: 'accepted — adopted in review (no user judgment)' }),
    '902-b.md': adr({ id: 902, status: 'accepted — adopted from a verified review finding (no user judgment)' }),
  });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: in review.\n- R-902 [] Title 902. Adopted: from a verified review finding.'));
});

test('Given a table entry, when register runs, then the refused list excludes that option', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS }) }, ['--chosen', '{"901": 2}']);

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Alpha.'));
});

test('Given a table entry none, when register runs, then no refused list is written', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS }) }, ['--chosen', '{"901": "none"}']);

  assert.equal(result.out, line('- R-901 [] Title 901.'));
});

test('Given an explicit chosen marker, when register runs, then it beats the recommended option', () => {
  const sut = run;
  const options = ['1. **Alpha** *(recommended)* — a', '2. **Beta** *(user choice)* — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options, decision: ['Option 2 it is.'] }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Alpha.'));
});

test('Given a table entry contradicting a chosen marker, when register runs, then it refuses', () => {
  const sut = run;
  const options = ['1. **Alpha** — a', '2. **Beta** *(chosen)* — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) }, ['--chosen', '{"901": 1}']);

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: /);
});

test('Given no recommended marker, when register runs, then no refused list is written', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, options: ['1. **Alpha** — a', '2. **Beta** — b'] }) });

  assert.equal(result.out, line('- R-901 [] Title 901.'));
});

test('Given a single option, when register runs, then no refused list is written', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, options: ['1. **Alpha** *(recommended)* — a'] }) });

  assert.equal(result.out, line('- R-901 [] Title 901.'));
});

test('Given two recommended markers, when register runs, then no refused list is written', () => {
  const sut = run;
  const options = ['1. **Alpha** *(recommended)* — a', '2. **Beta** *(recommended)* — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) });

  assert.equal(result.out, line('- R-901 [] Title 901.'));
});

test('Given an option title containing a semicolon, when register runs, then it is kept whole', () => {
  const sut = run;
  const options = ['1. **Alpha** *(recommended)* — a', '2. **Beta; with more** — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Beta; with more.'));
});

test('Given a title-less bold run, when register runs, then the text before the dash is the option title', () => {
  const sut = run;
  const options = ['1. Alpha *(recommended)* — a', '2. Beta — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Beta.'));
});

test('Given a --chosen table naming an unknown id, when register runs, then it exits 2 with no output', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901 }) }, ['--chosen', '{"999": 1}']);

  assert.equal(result.code, 2);
  assert.equal(result.out, '');
});

test('Given a --chosen option out of range, when register runs, then it exits 2', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS }) }, ['--chosen', '{"901": 3}']);

  assert.equal(result.code, 2);
  assert.equal(result.out, '');
});

test('Given malformed --chosen JSON, when register runs, then it exits 2', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901 }) }, ['--chosen', '{nope']);

  assert.equal(result.code, 2);
  assert.equal(result.out, '');
});

test('Given a --chosen value of the wrong type, when register runs, then it exits 2', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901 }) }, ['--chosen', '{"901": "two"}']);

  assert.equal(result.code, 2);
});

test('Given a ratified ADR naming a non-recommended option, when register runs, then it is a suspect', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision: ['We take Option 2.'] }) });

  assert.equal(result.code, 2);
  assert.equal(result.out, '');
  assert.match(result.err, /refuse 901: suspect chosen option — add a --chosen entry/);
});

test('Given the recommended-option-2 then Option 1 shape, when register runs, then it is a suspect', () => {
  const sut = run;
  const options = ['1. **Alpha** — a', '2. **Beta** *(recommended)* — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options, decision: ['The recommended option 2 was weighed; Option 1 wins.'] }) });

  assert.match(result.err, /refuse 901: suspect/);
});

test('Given a lead naming only the recommended option, when register runs, then it is not a suspect', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision: ['Option 1 holds.'] }) });

  assert.equal(result.code, 0);
});

test('Given a deviation phrase, when register runs, then it is a suspect', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision: ['We deviate from the design.'] }) });

  assert.match(result.err, /refuse 901: suspect/);
});

test('Given two suspects, when register runs, then both are listed', () => {
  const sut = run;
  const decision = ['We deviate.'];

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision }), '902-b.md': adr({ id: 902, options: TWO_OPTIONS, decision }) });

  assert.match(result.err, /refuse 901: suspect[^]*refuse 902: suspect/);
});

test('Given a suspect with a table entry, when register runs, then it is cleared', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision: ['We take Option 2.'] }) }, ['--chosen', '{"901": 2}']);

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Alpha.'));
});

test('Given a suspect with a chosen marker, when register runs, then it is cleared', () => {
  const sut = run;
  const options = ['1. **Alpha** *(recommended)* — a', '2. **Beta** *(chosen)* — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options, decision: ['We take Option 2.'] }) });

  assert.equal(result.code, 0);
});

test('Given an adopted ADR whose lead names another option, when register runs, then it is not a suspect', () => {
  const sut = run;
  const decision = ['**adopted-as-recommended (no user judgment)** — Option 2 was weighed.'];

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision }) });

  assert.equal(result.code, 0);
});
