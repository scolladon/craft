import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
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

const TOKEN_SCAN_BUDGET_MS = 1000;
const TABLE_FILE = 'table.json';

function run(files, extra = []) {
  const io = makeCaptureIo();
  const [flag, tableText] = extra;
  const tree = flag === '--chosen' ? { ...files, [TABLE_FILE]: tableText } : files;
  const argv = flag === '--chosen' ? [flag, TABLE_FILE] : extra;
  const deps = {
    cwd: () => '/work',
    listDir: () => Object.keys(tree),
    readFile: (p) => {
      const content = tree[p.split('/').pop()];
      if (content === undefined) throw new Error('ENOENT');
      return content;
    },
    isRegularEntry: () => true,
  };
  const code = main(['register', 'adr', ...argv], io, deps);
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

  const result = sut({ '901-a.md': adr({ id: 901, decision: lead }), '905-e.md': adr({ id: 905 }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: follows R-905 and more.\n- R-905 [] Title 905.'));
});

test('Given the Decision lead form without basis, when register runs, then the default basis is used', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, decision: ['**adopted-as-recommended (no user judgment)**'] }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: as recommended.'));
});

test('Given a lead with prose but no dash after the marker, when register runs, then the default basis is used', () => {
  const sut = run;
  const decision = ['**adopted-as-recommended (no user judgment).** Option 1. The fact lives in the frontmatter.'];

  const result = sut({ '901-a.md': adr({ id: 901, decision }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: as recommended.'));
});

test('Given a lead whose basis is followed by more sentences, when register runs, then only the first sentence is kept', () => {
  const sut = run;
  const decision = ['**adopted-as-recommended (no user judgment)** — DOCTRINE(D-14). Option 1: the measurement picked the route.'];

  const result = sut({ '901-a.md': adr({ id: 901, decision }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: DOCTRINE(D-14).'));
});

test('Given a lead whose basis is only an option number, when register runs, then the default basis is used', () => {
  const sut = run;
  const decision = ['**adopted-as-recommended (no user judgment)** — option 1. When status exists it wins.'];

  const result = sut({ '901-a.md': adr({ id: 901, decision }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: as recommended.'));
});

test('Given a lead whose basis is an option number without a period, when register runs, then the default basis is used', () => {
  const sut = run;
  const decision = ['**adopted-as-recommended (no user judgment)** — Option 2'];

  const result = sut({ '901-a.md': adr({ id: 901, decision }) });

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

test('Given a --chosen path that cannot be read, when register runs, then it exits 2 naming the file', () => {
  const io = makeCaptureIo();
  const deps = { cwd: () => '/work', listDir: () => [], readFile: () => { throw new Error('ENOENT'); }, isRegularEntry: () => true };

  const code = main(['register', 'adr', '--chosen', 'absent.json'], io, deps);

  assert.equal(code, 2);
  assert.match(io.stderr.joined(), /^rulings-migrate: --chosen cannot read absent\.json/);
});

const supersedes = (...entries) => `---\nsupersedes:\n${entries.map(([n, scope]) => `  - { adr: "${n}", scope: "${scope}" }`).join('\n')}\n---`;

test('Given an ADR superseded by a later one carrying a scope, when register runs, then its line ends with the superseding ruling and scope', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }),
    '902-b.md': adr({ id: 902, frontmatter: supersedes(['901', 'the old layout.']) }),
  };

  const result = sut(files);

  assert.equal(result.out, line('- R-901 [] Title 901. Superseded by R-902: the old layout.\n- R-902 [] Title 902.'));
});

test('Given a supersession chain, when register runs, then the first ADR points at the live tail with the direct successor scope', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }),
    '902-b.md': adr({ id: 902, status: 'superseded by ADR-903', frontmatter: supersedes(['901', 'first scope']) }),
    '903-c.md': adr({ id: 903 }),
  };

  const result = sut(files);

  assert.match(result.out, /- R-901 \[\] Title 901\. Superseded by R-903: first scope\.\n/);
});

test('Given a superseding ADR without a scope entry, when register runs, then the line points at the direct successor', () => {
  const sut = run;
  const files = { '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }), '902-b.md': adr({ id: 902 }) };

  const result = sut(files);

  assert.match(result.out, /- R-901 \[\] Title 901\. Superseded by R-902: see R-902\.\n/);
});

test('Given a supersession cycle, when register runs, then it refuses both ADRs', () => {
  const sut = run;
  const files = { '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }), '902-b.md': adr({ id: 902, status: 'superseded by ADR-901' }) };

  const result = sut(files);

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: supersession cycle/);
  assert.match(result.err, /refuse 902: supersession cycle/);
});

test('Given a successor with no file, when register runs, then it refuses the superseded ADR', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, status: 'superseded by ADR-950' }) });

  assert.match(result.err, /refuse 901: superseding ADR 950 has no file/);
});

test('Given a rejected ADR, when register runs, then its line ends with the rejection reason', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, status: 'rejected — reverted by hand.' }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Rejected: reverted by hand.'));
});

test('Given a supersession scope holding a reserved marker, when register runs, then it refuses the superseded ADR', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }),
    '902-b.md': adr({ id: 902, frontmatter: supersedes(['901', 'moved. Superseded by R-1: x']) }),
  };

  const result = sut(files);

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: /);
});

test('Given a refused option title holding the item separator, when register runs, then it refuses the ADR', () => {
  const sut = run;
  const options = ['1. **Alpha** *(recommended)* — a', '2. **Beta · Gamma** — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) });

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: /);
});

test('Given an ADR superseded by an earlier one, when register runs, then the register finding refuses it', () => {
  const sut = run;
  const files = { '900-a.md': adr({ id: 900 }), '901-b.md': adr({ id: 901, status: 'superseded by ADR-900' }) };

  const result = sut(files);

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: superseded by R-900 which is not a later ruling/);
});

test('Given a subject path that is not repo-relative, when register runs, then the register finding refuses it', () => {
  const sut = run;
  const frontmatter = '---\nsubjects:\n  - ../outside\n---';

  const result = sut({ '901-a.md': adr({ id: 901, frontmatter }) });

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: path "\.\.\/outside" must be repo-relative/);
});

test('Given ADRs from every chosen source, when register runs, then stderr reports the counts and the review lists', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, options: TWO_OPTIONS }),
    '902-b.md': adr({ id: 902, options: ['1. **Alpha** *(recommended)* — a', '2. **Beta** *(chosen)* — b'], decision: ['Option 2.'] }),
    '903-c.md': adr({ id: 903, status: 'accepted — adopted-as-recommended', options: TWO_OPTIONS }),
    '904-d.md': adr({ id: 904, options: TWO_OPTIONS }),
    '905-e.md': adr({ id: 905 }),
    '906-f.md': adr({ id: 906, decision: ['Settled.', '', 'Note adopted-as-recommended mid-text.'] }),
  };

  const result = sut(files, ['--chosen', '{"901": 2}']);

  assert.equal(result.code, 0);
  assert.equal(result.err, [
    'rulings-migrate: chosen table=1 chosen-marker=1 adopted=1 recommended=1 none=2',
    'rulings-migrate: not-recommended R-901, R-902',
    'rulings-migrate: adopted-mention-unrecognised R-906',
    '',
  ].join('\n'));
});

test('Given nothing to flag, when register runs, then the review lists read (none)', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901 }) });

  assert.match(result.err, /not-recommended \(none\)\n/);
  assert.match(result.err, /adopted-mention-unrecognised \(none\)\n/);
});

test('Given a refusing directory, when register runs, then stderr holds only the refusals', () => {
  const sut = run;

  const result = sut({ '901-a.md': 'no heading' });

  assert.equal(result.err, 'rulings-migrate: refuse 901: missing or malformed H1\n');
});

test('Given option items wrapped over several lines with the marker on a continuation line, when register runs, then the marked option is recommended and a wrapped title comes out whole', () => {
  const sut = run;
  const options = [
    '1. **The `decisions` phase only** — pros: the write already',
    '   routes through the port / cons: the lane grows only when',
    '   `decisions` runs. *(designer\'s recommendation)*',
    '2. Any phase that reads',
    '   an ADR backfills it — pros: fastest / cons: makes a reader a writer.',
  ];

  const result = sut({ '901-a.md': adr({ id: 901, options }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Any phase that reads an ADR backfills it.'));
});

const RECOMMENDED_FORMS = [
  '*(recommended)*',
  '(recommended)',
  "(designer's recommendation)",
  '(designer recommendation)',
  "*(designer's recommendation)*",
  '*(designer recommendation)*',
  '*(designer recommended)*',
  '*(recommended by the design)*',
  '*(recommendation)*',
  '*(design recommendation)*',
];
const CHOSEN_FORMS = ['*(chosen)*', '*(user choice)*', "*(user's choice)*"];

for (const marker of RECOMMENDED_FORMS) {
  test(`Given the recommended marker ${marker}, when register runs, then the option is recommended`, () => {
    const sut = run;
    const options = [`1. **Alpha** ${marker} — a`, '2. **Beta** — b'];

    const result = sut({ '901-a.md': adr({ id: 901, options }) });

    assert.equal(result.out, line('- R-901 [] Title 901. Refused: Beta.'));
  });
}

for (const marker of CHOSEN_FORMS) {
  test(`Given the chosen marker ${marker} on the second option, when register runs, then the first option is refused`, () => {
    const sut = run;
    const options = ['1. **Alpha** *(recommended)* — a', `2. **Beta** ${marker} — b`];

    const result = sut({ '901-a.md': adr({ id: 901, options }) });

    assert.equal(result.out, line('- R-901 [] Title 901. Refused: Alpha.'));
  });
}

test('Given a lead deviating from the design recommendation, when register runs, then it is a suspect needing a table entry', () => {
  const sut = run;
  const decision = ['We went against the design recommendation.'];

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision }) });

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: suspect chosen option/);
});

test('Given a lead naming the recommended option while another is not, when register runs, then it is not a suspect', () => {
  const sut = run;
  const decision = ['We take the recommended option 1.'];

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision }) });

  assert.equal(result.code, 0);
});

test('Given a lead naming recommended option 2 while option 1 is marked recommended, when register runs, then it is not a suspect', () => {
  const sut = run;
  const decision = ['We take recommended option 2.'];

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision }) });

  assert.equal(result.code, 0);
});

test('Given an adopted lead with the period inside the bold, when register runs, then it is adopted with its basis', () => {
  const sut = run;
  const decision = ['**adopted-as-recommended (no user judgment).** — follows the review.'];

  const result = sut({ '901-a.md': adr({ id: 901, options: TWO_OPTIONS, decision }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Beta. Adopted: follows the review.'));
});

function runCite(files, names = Object.keys(files), regular = () => true) {
  const io = makeCaptureIo();
  const written = {};
  const deps = {
    cwd: () => '/work',
    readFile: (p) => {
      const content = files[p.split('/').pop()];
      if (content === undefined) throw new Error('ENOENT');
      return content;
    },
    writeFile: (p, content) => {
      written[p.split('/').pop()] = content;
    },
    isRegularEntry: regular,
  };
  const code = main(['cite', ...names], io, deps);
  return { code, out: io.stdout.joined(), err: io.stderr.joined(), written };
}

test('Given a file citing a three-digit ADR id, when cite runs, then the file reads the ruling id', () => {
  const sut = runCite;

  const result = sut({ 'a.md': 'See ADR-901.\n' });

  assert.equal(result.code, 0);
  assert.equal(result.written['a.md'], 'See R-901.\n');
  assert.equal(result.out, 'rulings-migrate: cite a.md: 1 rewrites\n');
});

test('Given links, bare paths and a two-digit id, when cite runs, then each form is rewritten and the two-digit id is kept', () => {
  const sut = runCite;
  const text = [
    '[x](../contributing/adr/901-a-b.md#ctx)',
    'see `docs/contributing/adr/902-c-d.md` and docs/contributing/adr/903-e-f.md:1 and ADR-12',
    '',
  ].join('\n');

  const result = sut({ 'a.md': text });

  assert.equal(
    result.written['a.md'],
    ['[x](../contributing/RULINGS.md)', 'see `R-902` and R-903 and ADR-12', ''].join('\n'),
  );
  assert.equal(result.out, 'rulings-migrate: cite a.md: 3 rewrites\n');
});

test('Given a file without any citation, when cite runs, then nothing is written or reported', () => {
  const sut = runCite;

  const result = sut({ 'a.md': 'Nothing here, only ADR-12.\n' });

  assert.equal(result.code, 0);
  assert.deepEqual(result.written, {});
  assert.equal(result.out, '');
});

test('Given an unreadable file among readable ones, when cite runs, then it exits 2 and writes nothing', () => {
  const sut = runCite;

  const result = sut({ 'a.md': 'ADR-901\n' }, ['a.md', 'missing.md']);

  assert.equal(result.code, 2);
  assert.match(result.out, /^rulings-migrate: refuse missing\.md: /);
  assert.deepEqual(result.written, {});
});

test('Given a non-regular file, when cite runs, then it exits 2 and writes nothing', () => {
  const sut = runCite;

  const result = sut({ 'a.md': 'ADR-901\n' }, ['a.md'], () => false);

  assert.equal(result.code, 2);
  assert.match(result.out, /refuse a\.md: not a regular file/);
  assert.deepEqual(result.written, {});
});

test('Given a title citing an id, when register runs, then the statement cites the ruling id', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, title: 'Keep ADR-905 as is' }), '905-e.md': adr({ id: 905 }) });

  assert.equal(result.out, line('- R-901 [] Keep R-905 as is.\n- R-905 [] Title 905.'));
});

test('Given a refused option citing an id, when register runs, then the refused item cites the ruling id', () => {
  const sut = run;
  const options = ['1. **Alpha** *(recommended)* — a', '2. **Keep ADR-905** — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }), '905-e.md': adr({ id: 905 }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Keep R-905.\n- R-905 [] Title 905.'));
});

test('Given a supersession scope citing an id, when register runs, then the scope cites the ruling id', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }),
    '902-b.md': adr({ id: 902, frontmatter: supersedes(['901', 'the part ADR-903 kept']) }),
    '903-c.md': adr({ id: 903 }),
  };

  const result = sut(files);

  assert.equal(result.out, line('- R-901 [] Title 901. Superseded by R-902: the part R-903 kept.\n- R-902 [] Title 902.\n- R-903 [] Title 903.'));
});

test('Given a successor listing two supersedes entries, when register runs, then the entry for the superseded id supplies the scope', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }),
    '902-b.md': adr({ id: 902, frontmatter: supersedes(['900', 'scope nine hundred'], ['901', 'scope nine oh one']) }),
  };

  const result = sut(files);

  assert.match(result.out, /- R-901 \[\] Title 901\. Superseded by R-902: scope nine oh one\.\n/);
});

test('Given an ADR entry that is not a regular file, when register runs, then it is absent from the output', () => {
  const io = makeCaptureIo();
  const tree = { '901-a.md': adr({ id: 901 }), '902-b.md': adr({ id: 902 }) };
  const deps = {
    cwd: () => '/work',
    listDir: () => Object.keys(tree),
    readFile: (p) => tree[p.split('/').pop()],
    isRegularEntry: (p) => !p.endsWith('902-b.md'),
  };

  const code = main(['register', 'adr'], io, deps);

  assert.equal(code, 0);
  assert.equal(io.stdout.joined(), line('- R-901 [] Title 901.'));
  assert.match(io.stderr.joined(), /chosen table=0 chosen-marker=0 adopted=0 recommended=0 none=1\n/);
});

test('Given a three-node supersession cycle, when register runs, then it refuses with a cycle reason', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }),
    '902-b.md': adr({ id: 902, status: 'superseded by ADR-903' }),
    '903-c.md': adr({ id: 903, status: 'superseded by ADR-902' }),
  };

  const result = sut(files);

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: supersession cycle/);
});

test('Given a chain whose direct successor carries no scope entry, when register runs, then the fallback names the direct successor', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }),
    '902-b.md': adr({ id: 902, status: 'superseded by ADR-903' }),
    '903-c.md': adr({ id: 903 }),
  };

  const result = sut(files);

  assert.match(result.out, /- R-901 \[\] Title 901\. Superseded by R-903: see R-902\.\n/);
});

test('Given a rejection reason citing an ADR id, when register runs, then the reason cites the ruling id', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, status: 'rejected — replaced by ADR-905.' }), '905-e.md': adr({ id: 905 }) });

  assert.match(result.out, /- R-901 \[\] Title 901\. Rejected: replaced by R-905\.\n/);
});

test('Given a missing ADR directory, when register runs, then it exits 2 with a prefixed message', () => {
  const io = makeCaptureIo();
  const deps = { cwd: () => '/work', listDir: () => { throw new Error('ENOENT: no such directory'); } };

  const code = main(['register', 'nowhere'], io, deps);

  assert.equal(code, 2);
  assert.match(io.stderr.joined(), /^rulings-migrate: cannot read nowhere: ENOENT/);
});

test('Given a --chosen path holding a control character, when it cannot be read, then the message escapes it', () => {
  const io = makeCaptureIo();
  const deps = { cwd: () => '/work', listDir: () => [], readFile: () => { throw new Error('ENOENT'); } };

  const code = main(['register', 'adr', '--chosen', 'a\u001b[31m.json'], io, deps);

  assert.equal(code, 2);
  assert.equal(io.stderr.joined().includes('\u001b'), false);
  assert.match(io.stderr.joined(), /a\\x1b\[31m\.json/);
});

test('Given a very long slash-separated token, when cite runs, then it completes within the time budget and leaves the text unchanged', () => {
  const sut = runCite;
  const text = `${'a/'.repeat(40000)}\n`;

  const started = performance.now();
  const result = sut({ 'a.md': text });
  const elapsed = performance.now() - started;

  assert.equal(result.code, 0);
  assert.deepEqual(result.written, {});
  assert.ok(elapsed < TOKEN_SCAN_BUDGET_MS, `took ${elapsed} ms`);
});

test('Given bare paths with a near-miss prefix or suffix, when cite runs, then only the well-formed one is rewritten', () => {
  const sut = runCite;
  const text = 'x-adr/901-a.md y/adr/901-a.md:7 adr/12-a.md\n';

  const result = sut({ 'a.md': text });

  assert.equal(result.written['a.md'], 'x-adr/901-a.md R-901 adr/12-a.md\n');
});

test('Given a subject ending in a slash, when register runs, then it migrates to the directory glob', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, frontmatter: "---\nsubjects: ['test/', 'a.md']\n---" }) });

  assert.equal(result.out, line('- R-901 [test/**, a.md] Title 901.'));
});

test('Given a bare path followed by an extension suffix, when cite runs, then it is left untouched', () => {
  const sut = runCite;
  const text = 'a/adr/019-b.mdx docs/adr/020-c.md5 docs/adr/022-e.md-x docs/adr/021-d.md.\n';

  const result = sut({ 'a.md': text });

  assert.equal(result.written['a.md'], 'a/adr/019-b.mdx docs/adr/020-c.md5 docs/adr/022-e.md-x R-021.\n');
});

test('Given a title holding a control character, when register runs, then it refuses naming the control character', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, title: 'Use a\u001bb' }) });

  assert.equal(result.code, 2);
  assert.match(result.err, /refuse 901: title, option or basis holds a control character/);
});

const raw = (...parts) => parts.join('\n');
const H1 = (id) => `# ${id} ${EM_DASH} Title ${id}`;
const USAGE_TEXT = 'usage: rulings-migrate register <adr-dir> [--chosen <file.json>]\n       rulings-migrate cite <file>...\n';

test('Given malformed argv shapes, when main runs, then it prints the exact usage and exits 2', () => {
  const shapes = [
    ['bogus', 'adr'],
    ['register'],
    ['register', 'adr', '--chosen', 't.json', 'extra'],
    ['register', 'adr', '--bogus', 'x'],
    ['register', 'adr', '--chosen'],
    ['cite'],
  ];

  shapes.forEach((argv) => {
    const io = makeCaptureIo();

    const code = main(argv, io, { cwd: () => '/work' });

    assert.equal(code, 2, argv.join(' '));
    assert.equal(io.stderr.joined(), USAGE_TEXT, argv.join(' '));
    assert.equal(io.stdout.joined(), '', argv.join(' '));
  });
});

test('Given a --chosen id with no ADR, when register runs, then the message names the id', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901 }) }, ['--chosen', '{"999": 1}']);

  assert.equal(result.err, 'rulings-migrate: --chosen names unknown id 999\n');
});

test('Given files whose names only contain an ADR name, when register runs, then only the anchored names are listed', () => {
  const sut = run;
  const files = {
    '901-a.md.bak': adr({ id: 901 }),
    'draft-903-c.md': adr({ id: 903 }),
    '902-b.md': adr({ id: 902 }),
  };

  const result = sut(files);

  assert.equal(result.out, line('- R-902 [] Title 902.'));
});

test('Given ids of different digit counts, when register runs, then lines follow the numeric id order', () => {
  const sut = run;

  const result = sut({ '1000-a.md': adr({ id: 1000 }), '999-b.md': adr({ id: 999 }) });

  assert.equal(result.out, line('- R-999 [] Title 999.\n- R-1000 [] Title 1000.'));
});

test('Given a repeated id, when register runs, then the later name in sort order is refused as repeated', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901 }), '0901-b.md': adr({ id: 901 }) });

  assert.equal(result.err, 'rulings-migrate: refuse 901: repeated id\n');
});

test('Given an H1 not at the line start or with a carriage return, when register runs, then it refuses as malformed', () => {
  const sut = run;
  const embedded = raw(`# See # 901 ${EM_DASH} Title`, '');
  const crlf = raw(`# 901 ${EM_DASH} Title\r`, '');

  assert.match(sut({ '901-a.md': embedded }).err, /refuse 901: missing or malformed H1/);
  assert.match(sut({ '901-a.md': crlf }).err, /refuse 901: missing or malformed H1/);
});

test('Given a title with trailing spaces, when register runs, then the statement is trimmed', () => {
  const sut = run;

  const result = sut({ '901-a.md': raw(`# 901 ${EM_DASH} Padded   `, '') });

  assert.equal(result.out, line('- R-901 [] Padded.'));
});

test('Given malformed frontmatter, when register runs, then the refusal carries the parser message', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, frontmatter: '---\nsubjects: [a\n---' }) });

  assert.doesNotMatch(result.err, /non-empty strings/);
});

test('Given subjects with an empty entry or a non-string entry, when register runs, then it refuses', () => {
  const sut = run;

  ["['a', '']", '[1]'].forEach((subjects) => {
    const result = sut({ '901-a.md': adr({ id: 901, frontmatter: `---\nsubjects: ${subjects}\n---` }) });

    assert.equal(result.err, 'rulings-migrate: refuse 901: subjects is not a list of non-empty strings\n', subjects);
  });
});

test('Given a numbered list outside any options section, when register runs, then no option is read', () => {
  const sut = run;
  const content = raw(H1(901), '', ...TWO_OPTIONS, '', '## Decision', '', 'Settled.', '');

  const result = sut({ '901-a.md': content });

  assert.equal(result.out, line('- R-901 [] Title 901.'));
});

test('Given an options heading on the first line, when register runs, then its items are read', () => {
  const sut = run;
  const content = raw('## Options considered', ...TWO_OPTIONS, H1(901), '');

  const result = sut({ '901-a.md': content });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Beta.'));
});

test('Given a numbered list in the section after the options, when register runs, then it is not read as options', () => {
  const sut = run;
  const content = raw(H1(901), '', '## Options considered', '', ...TWO_OPTIONS, '', '## Decision', '', '3. **Gamma** *(recommended)* — c', '');

  const result = sut({ '901-a.md': content });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Beta.'));
});

test('Given an options heading directly followed by another heading, when register runs, then no option is read', () => {
  const sut = run;
  const content = raw(H1(901), '', '## Options considered', '## Decision', '', ...TWO_OPTIONS, '');

  const result = sut({ '901-a.md': content });

  assert.equal(result.out, line('- R-901 [] Title 901.'));
});

test('Given an options section ending the file without a trailing newline, when register runs, then the last item is read', () => {
  const sut = run;
  const content = raw(H1(901), '', '## Options considered', '', '1. **Alpha** — a', '2. **Beta** *(recommended)* — b');

  const result = sut({ '901-a.md': content });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Alpha.'));
});

test('Given an option numbered above nine, when register runs, then it is read as an option', () => {
  const sut = run;
  const options = ['1. **Alpha** — a', '10. **Ten** *(recommended)* — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Alpha.'));
});

test('Given a lead naming the recommended option numbered above nine, when register runs, then it is not a suspect', () => {
  const sut = run;
  const options = ['1. **Alpha** — a', '10. **Ten** *(recommended)* — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options, decision: ['Option 10 it is.'] }) });

  assert.equal(result.code, 0);
  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Alpha.'));
});

test('Given an unanchored or carriage-return numbered line in the options section, when register runs, then it is not an option', () => {
  const sut = run;
  const embedded = ['1. **Alpha** — a', 'see 2. **Beta** *(recommended)* — b'];
  const carriageReturn = ['1. **Alpha** *(recommended)* — a', '2. **Beta** — b\r'];

  assert.equal(sut({ '901-a.md': adr({ id: 901, options: embedded }) }).out, line('- R-901 [] Title 901.'));
  assert.equal(sut({ '901-a.md': adr({ id: 901, options: carriageReturn }) }).out, line('- R-901 [] Title 901.'));
});

test('Given stray lines after an option item, when register runs, then only an indented line directly continuing it is joined', () => {
  const sut = run;
  const cases = [
    ['1. **Alpha** — a', 'stray *(recommended)* text', '2. **Beta** — b'],
    ['1. **Alpha** — a', '', '  stray *(recommended)*', '2. **Beta** — b'],
    ['1. **Alpha** — a', 'plain', '  stray *(recommended)*', '2. **Beta** — b'],
  ];

  cases.forEach((options) => {
    const result = sut({ '901-a.md': adr({ id: 901, options }) });

    assert.equal(result.out, line('- R-901 [] Title 901.'), options.join('|'));
  });
});

test('Given a continuation indented by one space, when register runs, then it is joined to its item', () => {
  const sut = run;
  const options = ['1. **Alpha** — a', ' *(recommended)*', '2. **Beta** — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Beta.'));
});

test('Given a marker wrapped across a deeply indented continuation, when register runs, then the lines join with a single space', () => {
  const sut = run;
  const options = ["1. **Alpha** (designer's", '      recommendation) — a', '2. **Beta** — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Beta.'));
});

test('Given option titles in several shapes, when register runs, then each refused title is normalised', () => {
  const sut = run;
  const options = ['1. **Alpha** *(chosen)* — a', '2. Plain **bold** words — b', '3. ** Padded ** — c', '4. **Be  ta   Two** — d', '5. Gamma*(recommended)*Delta — e'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) });

  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Plain **bold** words · Padded · Be ta Two · Gamma Delta.'));
});

test('Given a decision section on the first line, when register runs, then its lead is read', () => {
  const sut = run;
  const content = raw('## Decision', '', `**adopted-as-recommended (no user judgment).** ${EM_DASH} because.`, '', H1(901), '');

  const result = sut({ '901-a.md': content });

  assert.equal(result.out, line('- R-901 [] Title 901. Adopted: because.'));
});

test('Given an ADR without a decision section, when register runs, then it is migrated without an adoption', () => {
  const sut = run;

  const result = sut({ '901-a.md': raw(H1(901), '', '- **Status:** accepted', '') });

  assert.equal(result.out, line('- R-901 [] Title 901.'));
});

test('Given decision lead shapes, when register runs, then the lead is the first non-blank paragraph, trimmed', () => {
  const sut = run;
  const lead = '**adopted-as-recommended (no user judgment).**';
  const cases = [
    [raw(H1(901), '', '## Decision', '   ', `  ${lead} ${EM_DASH} x.`, ''), 'x'],
    [raw(H1(901), '', '## Decision', `${lead} ${EM_DASH} y.`), 'y'],
    [raw(H1(901), '', '## Decision', '', `${lead} ${EM_DASH} z.`), 'z'],
    [raw(H1(901), '', '## Decision', '', lead, '   ', `${EM_DASH} later.`, ''), 'as recommended'],
    [raw(H1(901), '', '## Decision', '', lead, '', `${EM_DASH} later.`, ''), 'as recommended'],
  ];

  cases.forEach(([content, basis]) => {
    const result = sut({ '901-a.md': content });

    assert.equal(result.out, line(`- R-901 [] Title 901. Adopted: ${basis}.`), content);
  });
});

test('Given lead bases in several shapes, when register runs, then the basis follows the dash rule', () => {
  const sut = run;
  const marker = '**adopted-as-recommended (no user judgment).**';
  const cases = [
    [`${marker} because ${EM_DASH} x.`, 'as recommended'],
    [`${marker}${EM_DASH} tight.`, 'tight'],
    [`${marker} ${EM_DASH}reason.`, 'reason'],
    [`${marker} ${EM_DASH}`, 'as recommended'],
    [`${marker} ${EM_DASH} spaced .`, 'spaced'],
    [`${marker} ${EM_DASH} option 10`, 'as recommended'],
    [`${marker} ${EM_DASH} option 1x`, 'option 1x'],
    [`${marker} ${EM_DASH} see option 1`, 'see option 1'],
    [`${marker} ${EM_DASH} option 1 is better`, 'option 1 is better'],
  ];

  cases.forEach(([lead, basis]) => {
    const result = sut({ '901-a.md': adr({ id: 901, decision: [lead] }) });

    assert.equal(result.out, line(`- R-901 [] Title 901. Adopted: ${basis}.`), lead);
  });
});

test('Given a table entry agreeing with the chosen marker, when register runs, then it is accepted', () => {
  const sut = run;
  const options = ['1. **Alpha** — a', '2. **Beta** *(chosen)* — b'];

  const result = sut({ '901-a.md': adr({ id: 901, options }) }, ['--chosen', '{"901": 2}']);

  assert.equal(result.code, 0);
  assert.equal(result.out, line('- R-901 [] Title 901. Refused: Alpha.'));
});

test('Given several adopted ADRs and one recommended, when register runs, then the sources are counted apart', () => {
  const sut = run;
  const adopted = (id) => adr({ id, status: 'accepted — adopted-as-recommended', options: TWO_OPTIONS });
  const files = { '901-a.md': adopted(901), '902-b.md': adopted(902), '903-c.md': adr({ id: 903, options: TWO_OPTIONS }) };

  const result = sut(files);

  assert.match(result.err, /^rulings-migrate: chosen table=0 chosen-marker=0 adopted=2 recommended=1 none=0\n/);
});

test('Given a status that merely mentions a supersession or a rejection, when register runs, then no status is derived', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, status: 'accepted (was superseded by ADR-902 once)' }),
    '902-b.md': adr({ id: 902, status: 'accepted (not rejected — see above)' }),
    '903-c.md': adr({ id: 903, status: 'rejected — a b' }),
  };

  const result = sut(files);

  assert.equal(result.out, line('- R-901 [] Title 901.\n- R-902 [] Title 902.\n- R-903 [] Title 903.'));
});

test('Given a rejection reason and a scope holding inner dots, when register runs, then only the final dot is dropped', () => {
  const sut = run;
  const files = {
    '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }),
    '902-b.md': adr({ id: 902, frontmatter: supersedes(['901', 'see v1.2 notes.']) }),
    '903-c.md': adr({ id: 903, status: 'rejected — needs v1.2 first.' }),
  };

  const result = sut(files);

  assert.match(result.out, /Superseded by R-902: see v1\.2 notes\.\n/);
  assert.match(result.out, /- R-903 \[\] Title 903\. Rejected: needs v1\.2 first\./);
});

test('Given a successor whose frontmatter parses to nothing or lists a null entry, when register runs, then the entry for the id still resolves', () => {
  const sut = run;
  const successor = (frontmatter) => adr({ id: 902, frontmatter });
  const withNull = '---\nsupersedes:\n  - ~\n  - { adr: "901", scope: "kept." }\n---';

  const empty = sut({ '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }), '902-b.md': successor('---\n~\n---') });
  const listed = sut({ '901-a.md': adr({ id: 901, status: 'superseded by ADR-902' }), '902-b.md': successor(withNull) });

  assert.match(empty.out, /Superseded by R-902: see R-902\./);
  assert.match(listed.out, /Superseded by R-902: kept\./);
});

test('Given --chosen JSON of an invalid shape, when register runs, then it refuses with the shape message', () => {
  const sut = run;
  const files = { '901-a.md': adr({ id: 901, options: TWO_OPTIONS }), '902-b.md': adr({ id: 902 }) };
  const invalid = ['null', '5', '[]', '"abc"', '{"901": 1, "902": "x"}', '{"x901": 1}', '{"901x": 1}', '{"901": 0}', '{"901": -1}', '{"901": 1.5}'];

  invalid.forEach((table) => {
    const result = sut(files, ['--chosen', table]);

    assert.equal(result.code, 2, table);
    assert.equal(result.err, 'rulings-migrate: --chosen must map ids to a positive integer or "none"\n', table);
  });
});

test('Given links without an anchor and bare paths with long line suffixes, when cite runs, then each is rewritten', () => {
  const sut = runCite;
  const text = '[x](../adr/901-a.md) docs/adr/902-b.md:12 docs/adr/903-c.md.md\n';

  const result = sut({ 'a.md': text });

  assert.equal(result.written['a.md'], '[x](../RULINGS.md) R-902 docs/adr/903-c.md.md\n');
});

test('Given the default dependencies, when cite runs over a real relative path, then the file is rewritten in place', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rulingsmigrate-cite-'));
  try {
    const file = join(dir, 'a.md');
    writeFileSync(file, 'See ADR-901.\n');
    const io = makeCaptureIo();

    const code = main(['cite', relative(process.cwd(), file)], io);

    assert.equal(code, 0);
    assert.equal(readFileSync(file, 'utf8'), 'See R-901.\n');
    assert.equal(io.stdout.joined(), `rulings-migrate: cite ${relative(process.cwd(), file)}: 1 rewrites\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given the default dependencies, when cite runs over a directory, then it refuses as not a regular file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rulingsmigrate-cite-'));
  try {
    const io = makeCaptureIo();

    const code = main(['cite', dir], io);

    assert.equal(code, 2);
    assert.match(io.stdout.joined(), /: refuse .*: not a regular file\n/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Given malformed --chosen JSON, when register runs, then the refusal names the parse failure', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901 }) }, ['--chosen', '{not json']);

  assert.match(result.err, /^rulings-migrate: --chosen table\.json is not valid JSON: /);
});

test('Given a decision heading followed only by blank lines, when register runs, then it is migrated without an adoption', () => {
  const sut = run;

  const result = sut({ '901-a.md': adr({ id: 901, decision: [] }) });

  assert.equal(result.out, line('- R-901 [] Title 901.'));
});
