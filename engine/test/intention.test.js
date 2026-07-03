import { test } from 'node:test';
import assert from 'node:assert/strict';

import { consult, assertFresh } from '../src/intention.js';

const OBS_GLOB = 'engine/src/observability/**';
const OBS_PATH = 'engine/src/observability/memory.js';

function page(subjects, title = '# Telemetry adapter spec') {
  return [
    '---',
    `subjects: [${subjects.map(s => `'${s}'`).join(', ')}]`,
    '---',
    '',
    title,
    '',
    'Body prose.',
  ].join('\n');
}

function corpusOf(pages) {
  return {
    listCorpus: () => Object.keys(pages),
    readPage: p => (Object.hasOwn(pages, p) ? pages[p] : null),
  };
}

// consult

test('Given a page whose subjects intersect scope, when consult runs, then it returns an entry with path and purpose', () => {
  const sut = consult;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(result.entries, [
    { path: 'docs/adapters/telemetry.md', purpose: 'Telemetry adapter spec' },
  ]);
  assert.deepEqual(result.skipped, []);
});

test('Given a page with no subjects, when consult runs, then it is listed in skipped with reason no-subjects', () => {
  const sut = consult;
  const deps = corpusOf({ 'docs/DESIGN-history.md': '# History\n\nno frontmatter here\n' });

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.skipped, [{ page: 'docs/DESIGN-history.md', reason: 'no-subjects' }]);
});

test('Given an unreadable page, when consult runs, then it is omitted from both entries and skipped (skip, not reject)', () => {
  const sut = consult;
  const deps = { listCorpus: () => ['docs/gone.md'], readPage: () => null };

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(result, { entries: [], skipped: [] });
});

test('Given an empty scope, when consult runs, then entries is empty', () => {
  const sut = consult;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });

  const result = sut([], deps);

  assert.deepEqual(result.entries, []);
});

test('Given a page whose subjects value is a non-array scalar, when consult runs, then it is treated as malformed-subjects (never iterated as a string\'s characters)', () => {
  const sut = consult;
  const deps = corpusOf({ 'docs/weird.md': '---\nsubjects: foo\n---\n\n# Weird\n' });

  const result = sut(['f'], deps);

  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.skipped, [{ page: 'docs/weird.md', reason: 'malformed-subjects' }]);
});

test('Given a page whose frontmatter opens but mis-types its YAML, when consult runs, then it is skipped as malformed-subjects rather than throwing', () => {
  const sut = consult;
  const deps = corpusOf({ 'docs/broken.md': '---\nsubjects: [unclosed\n---\n\n# Broken\n' });

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.skipped, [{ page: 'docs/broken.md', reason: 'malformed-subjects' }]);
});

test('Given a page whose body contains a `---` thematic break, when consult runs, then the purpose is still extracted from the H1', () => {
  const sut = consult;
  const content = [
    '---',
    `subjects: ['${OBS_GLOB}']`,
    '---',
    '',
    '# Telemetry adapter spec',
    '',
    'Body prose.',
    '',
    '---',
    '',
    'More prose after a thematic break.',
  ].join('\n');
  const deps = corpusOf({ 'docs/adapters/telemetry.md': content });

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(result.entries, [
    { path: 'docs/adapters/telemetry.md', purpose: 'Telemetry adapter spec' },
  ]);
});

// assertFresh — pinned scenarios

test('Given a changed path matching a page\'s subjects and the page untouched and unwaived, when assertFresh runs, then it emits one stale row (scenario A)', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });
  const change = { changed: [OBS_PATH], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.stale, [
    { page: 'docs/adapters/telemetry.md', changedPaths: [OBS_PATH], waived: false },
  ]);
});

test('Given a changed path matching a page\'s subjects and the page itself touched, when assertFresh runs, then it emits no stale row (scenario B)', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });
  const change = { changed: [OBS_PATH], touched: ['docs/adapters/telemetry.md'], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.stale, []);
});

test('Given a stale candidate page named in INTENTION-WAIVE, when assertFresh runs, then the row carries waived:true', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });
  const change = { changed: [OBS_PATH], touched: [], waived: ['docs/adapters/telemetry.md'] };

  const result = sut(change, deps);

  assert.deepEqual(result.stale, [
    { page: 'docs/adapters/telemetry.md', changedPaths: [OBS_PATH], waived: true },
  ]);
});

// assertFresh — coverage

test('Given a covers scope matched by no page\'s subjects, when assertFresh runs, then it is reported uncovered', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page(['docs/adapters/*.md']) });
  const change = { changed: [], touched: [], waived: [], covers: [OBS_GLOB] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, [{ scope: OBS_GLOB }]);
});

test('Given a covers scope matched by a page\'s subjects, when assertFresh runs, then it is not reported uncovered', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });
  const change = { changed: [], touched: [], waived: [], covers: [OBS_GLOB] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, []);
});

test('Given a page whose subjects glob is a subset of a covers scope, when assertFresh runs, then the overlapping scope is not reported uncovered', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page(['engine/src/observability/*.js']) });
  const change = { changed: [], touched: [], waived: [], covers: ['engine/src/observability/**'] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, []);
});

test('Given a page\'s subjects glob strictly containing a covers scope (differing length), when assertFresh runs, then the covers scope is not reported uncovered', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page(['engine/src/**']) });
  const change = { changed: [], touched: [], waived: [], covers: ['engine/src/observability/**'] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, []);
});

test('Given a page\'s subjects glob sharing a non-boundary literal prefix with a covers scope, when assertFresh runs, then the covers scope is still reported uncovered (segment-aware containment)', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page(['engine/src/foobar/**']) });
  const change = { changed: [], touched: [], waived: [], covers: ['engine/src/foo/**'] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, [{ scope: 'engine/src/foo/**' }]);
});

test('Given a covers scope disjoint from every page\'s subjects, when assertFresh runs, then it is reported uncovered', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page(['engine/src/**']) });
  const change = { changed: [], touched: [], waived: [], covers: ['docs/**'] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, [{ scope: 'docs/**' }]);
});

test('Given no covers key on the change, when assertFresh runs, then uncovered is an empty recorded no-op', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });
  const change = { changed: [], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, []);
});

test('Given an empty covers list, when assertFresh runs, then uncovered is empty', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });
  const change = { changed: [], touched: [], waived: [], covers: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, []);
});

// assertFresh — skipped, note, empty-corpus

test('Given a page with no subjects, when assertFresh runs, then it is listed in skipped with reason no-subjects', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/DESIGN-history.md': '# History\n\nno frontmatter here\n' });
  const change = { changed: [], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.skipped, [{ page: 'docs/DESIGN-history.md', reason: 'no-subjects' }]);
});

test('Given an empty corpus, when assertFresh runs, then note is set to "no living pages carry subjects"', () => {
  const sut = assertFresh;
  const deps = corpusOf({});
  const change = { changed: [], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.equal(result.note, 'no living pages carry subjects');
  assert.deepEqual(result.stale, []);
});

test('Given at least one page carrying subjects, when assertFresh runs, then note is omitted', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });
  const change = { changed: [], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.equal('note' in result, false);
});

test('Given a change object that omits the waived key entirely, when assertFresh runs, then it does not throw and the stale row has waived: false', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });
  const change = { changed: [OBS_PATH], touched: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.stale, [
    { page: 'docs/adapters/telemetry.md', changedPaths: [OBS_PATH], waived: false },
  ]);
});

test('Given the report schema, when assertFresh runs, then schemaVersion is 1', () => {
  const sut = assertFresh;
  const deps = corpusOf({});
  const change = { changed: [], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.equal(result.schemaVersion, 1);
});

// assertFresh — edge matrix

test('Given a subject glob matching zero changed paths, when assertFresh runs, then there is no stale row and no error', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/adapters/telemetry.md': page([OBS_GLOB]) });
  const change = { changed: ['engine/src/dod.js'], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.stale, []);
});

test('Given an unreadable page, when assertFresh runs, then it never throws and contributes nothing to the report', () => {
  const sut = assertFresh;
  const deps = { listCorpus: () => ['docs/gone.md'], readPage: () => null };
  const change = { changed: [OBS_PATH], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.stale, []);
  assert.deepEqual(result.skipped, []);
});

test('Given a page whose subjects value is a non-array scalar, when assertFresh runs, then it is treated as malformed-subjects rather than iterated as characters', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/weird.md': '---\nsubjects: foo\n---\n\n# Weird\n' });
  const change = { changed: ['f'], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.stale, []);
  assert.deepEqual(result.skipped, [{ page: 'docs/weird.md', reason: 'malformed-subjects' }]);
});

test('Given a page whose frontmatter opens but mis-types its YAML, when assertFresh runs, then it never throws and reports malformed-subjects', () => {
  const sut = assertFresh;
  const deps = corpusOf({ 'docs/broken.md': '---\nsubjects: [unclosed\n---\n\n# Broken\n' });
  const change = { changed: [OBS_PATH], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(result.skipped, [{ page: 'docs/broken.md', reason: 'malformed-subjects' }]);
  assert.deepEqual(result.stale, []);
});

test('Given two stale pages, when assertFresh runs, then stale rows are sorted by page (stable serialization)', () => {
  const sut = assertFresh;
  const deps = corpusOf({
    'docs/adapters/zeta.md': page([OBS_GLOB]),
    'docs/adapters/alpha.md': page([OBS_GLOB]),
  });
  const change = { changed: [OBS_PATH], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(
    result.stale.map(row => row.page),
    ['docs/adapters/alpha.md', 'docs/adapters/zeta.md'],
  );
});

// classifySubjects — non-string elements (never-throws regression guard)

test('Given a page whose subjects array contains a non-string element, when consult and assertFresh run, then both classify it malformed-subjects and neither throws', () => {
  const deps = corpusOf({ 'docs/weird.md': '---\nsubjects: [123]\n---\n\n# Weird\n' });

  const consultResult = consult([OBS_PATH], deps);
  const assertFreshResult = assertFresh(
    { changed: [OBS_PATH], touched: [], waived: [], covers: ['engine/src/**'] },
    deps,
  );

  assert.deepEqual(consultResult.skipped, [{ page: 'docs/weird.md', reason: 'malformed-subjects' }]);
  assert.deepEqual(assertFreshResult.skipped, [{ page: 'docs/weird.md', reason: 'malformed-subjects' }]);
});

// assertFresh — property lens (freshness invariant, deterministic generator)

// consult — sort-order (sortBy key must be the real field, not a no-op)

test('Given two matching pages and two skipped pages inserted out of order, when consult runs, then entries are sorted by path and skipped are sorted by page', () => {
  const sut = consult;
  const deps = corpusOf({
    'docs/adapters/zeta.md': page([OBS_GLOB]),
    'docs/adapters/alpha.md': page([OBS_GLOB]),
    'docs/zzz-history.md': '# Zzz\n\nno frontmatter here\n',
    'docs/aaa-history.md': '# Aaa\n\nno frontmatter here\n',
  });

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(
    result.entries.map(e => e.path),
    ['docs/adapters/alpha.md', 'docs/adapters/zeta.md'],
  );
  assert.deepEqual(
    result.skipped.map(s => s.page),
    ['docs/aaa-history.md', 'docs/zzz-history.md'],
  );
});

test('Given two skipped pages inserted out of order, when assertFresh runs, then skipped is sorted by page', () => {
  const sut = assertFresh;
  const deps = corpusOf({
    'docs/zzz-history.md': '# Zzz\n\nno frontmatter here\n',
    'docs/aaa-history.md': '# Aaa\n\nno frontmatter here\n',
  });
  const change = { changed: [], touched: [], waived: [] };

  const result = sut(change, deps);

  assert.deepEqual(
    result.skipped.map(s => s.page),
    ['docs/aaa-history.md', 'docs/zzz-history.md'],
  );
});

// classifySubjects — malformed elements within an otherwise-valid array

test('Given a subjects array mixing a valid glob and a non-string element, when consult runs, then the page is malformed-subjects (every element must validate, not just one)', () => {
  const sut = consult;
  const content = [
    '---',
    "subjects: ['docs/adapters/*.md', 123]",
    '---',
    '',
    '# Mixed subjects',
    '',
  ].join('\n');
  const deps = corpusOf({ 'docs/mixed.md': content });

  const result = sut(['docs/adapters/foo.md'], deps);

  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.skipped, [{ page: 'docs/mixed.md', reason: 'malformed-subjects' }]);
});

test('Given a subjects array containing only a whitespace-only string, when consult runs, then the page is malformed-subjects (blank after trim is not a usable subject)', () => {
  const sut = consult;
  const deps = corpusOf({ 'docs/blank-subject.md': page(['   ']) });

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.skipped, [{ page: 'docs/blank-subject.md', reason: 'malformed-subjects' }]);
});

// matchingPaths — any subject glob suffices (not all of them)

test('Given a page whose subjects include one matching glob and one non-matching glob, when consult runs, then the page is still included (any subject match suffices)', () => {
  const sut = consult;
  const deps = corpusOf({
    'docs/adapters/telemetry.md': page([OBS_GLOB, 'totally/unrelated/**']),
  });

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(result.entries, [
    { path: 'docs/adapters/telemetry.md', purpose: 'Telemetry adapter spec' },
  ]);
});

// buildStaleRow — changedPaths must be sorted

test('Given multiple changed paths matching a page in reverse order, when assertFresh runs, then the stale row\'s changedPaths are sorted ascending', () => {
  const sut = assertFresh;
  const deps = corpusOf({
    'docs/adapters/telemetry.md': page(['engine/src/observability/**']),
  });
  const change = {
    changed: ['engine/src/observability/zzz.js', 'engine/src/observability/aaa.js'],
    touched: [],
    waived: [],
  };

  const result = sut(change, deps);

  assert.deepEqual(result.stale[0].changedPaths, [
    'engine/src/observability/aaa.js',
    'engine/src/observability/zzz.js',
  ]);
});

// findUncovered — any page / any subject suffices (not all of them)

test('Given one page covering a scope and a second page that does not, when assertFresh runs, then the scope is not reported uncovered (any covering page suffices)', () => {
  const sut = assertFresh;
  const deps = corpusOf({
    'docs/adapters/telemetry.md': page([OBS_GLOB]),
    'docs/adapters/unrelated.md': page(['totally/unrelated/**']),
  });
  const change = { changed: [], touched: [], waived: [], covers: [OBS_GLOB] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, []);
});

test('Given a single page whose subjects mix a matching glob and a non-matching glob, when assertFresh runs, then the scope is not reported uncovered (any subject of the page suffices)', () => {
  const sut = assertFresh;
  const deps = corpusOf({
    'docs/adapters/telemetry.md': page([OBS_GLOB, 'totally/unrelated/**']),
  });
  const change = { changed: [], touched: [], waived: [], covers: [OBS_GLOB] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, []);
});

test('Given duplicate and out-of-order uncovered scopes with an empty corpus, when assertFresh runs, then uncovered is sorted by scope (exercising <, >, and === key comparisons)', () => {
  const sut = assertFresh;
  const deps = corpusOf({});
  const change = { changed: [], touched: [], waived: [], covers: ['zzz/**', 'aaa/**', 'aaa/**', 'mmm/**'] };

  const result = sut(change, deps);

  assert.deepEqual(result.uncovered, [
    { scope: 'aaa/**' },
    { scope: 'aaa/**' },
    { scope: 'mmm/**' },
    { scope: 'zzz/**' },
  ]);
});

test('Given the same page identifier listed twice with divergent readPage results (a tied sort key on distinguishable rows), when consult runs, then skipped preserves original relative order (stable sort, not a forced swap on ties)', () => {
  const sut = consult;
  const responses = [
    '---\nsubjects: [unclosed\n---\n\n# Broken\n', // -> malformed-subjects
    '# History\n\nno frontmatter here\n', // -> no-subjects
  ];
  let calls = 0;
  const deps = {
    listCorpus: () => ['docs/dup.md', 'docs/dup.md'],
    readPage: () => responses[calls++],
  };

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(result.skipped, [
    { page: 'docs/dup.md', reason: 'malformed-subjects' },
    { page: 'docs/dup.md', reason: 'no-subjects' },
  ]);
});

// extractPurpose — leading whitespace and heading-marker regex edge cases

test('Given an H1 line with leading whitespace, when consult runs, then the purpose is still trimmed', () => {
  const sut = consult;
  const deps = corpusOf({
    'docs/adapters/telemetry.md': page([OBS_GLOB], '   # Padded Title'),
  });

  const result = sut([OBS_PATH], deps);

  assert.equal(result.entries[0].purpose, 'Padded Title');
});

test('Given an H2 page with no space after the hashes, when consult runs, then the purpose strips all leading hashes with no required trailing space', () => {
  const sut = consult;
  const deps = corpusOf({
    'docs/adapters/telemetry.md': page([OBS_GLOB], '##Title'),
  });

  const result = sut([OBS_PATH], deps);

  assert.equal(result.entries[0].purpose, 'Title');
});

test('Given a first content line that contains a hash mid-line but does not start with one, when consult runs, then the purpose is that line unchanged (the heading regex must anchor at line start)', () => {
  const sut = consult;
  const deps = corpusOf({
    'docs/adapters/telemetry.md': page([OBS_GLOB], 'Design # Notes'),
  });

  const result = sut([OBS_PATH], deps);

  assert.equal(result.entries[0].purpose, 'Design # Notes');
});

// stripFrontmatter — unterminated block and whitespace-padded closing fence

test('Given a frontmatter block with no closing fence, when consult runs, then the purpose is empty (an unterminated block strips to nothing)', () => {
  const sut = consult;
  const content = ['---', "subjects: ['docs/adapters/*.md']", '', 'note: trailing'].join('\n');
  const deps = corpusOf({ 'docs/unclosed.md': content });

  const result = sut(['docs/adapters/foo.md'], deps);

  assert.deepEqual(result.entries, [{ path: 'docs/unclosed.md', purpose: '' }]);
});

test('Given a closing frontmatter fence padded with trailing spaces, when consult runs, then the fence is still recognized and the purpose is extracted past it', () => {
  const sut = consult;
  const content = ['---', `subjects: ['${OBS_GLOB}']`, '---  ', '', '# Title', ''].join('\n');
  const deps = corpusOf({ 'docs/padded-fence.md': content });

  const result = sut([OBS_PATH], deps);

  assert.deepEqual(result.entries, [{ path: 'docs/padded-fence.md', purpose: 'Title' }]);
});

test('Given generated (changed, touched, waived) tuples over a fixed page/subject, when assertFresh runs, then the report matches the freshness invariant stale(P) <=> (changed ∩ subjects) ∧ P∉touched ∧ ¬waived(P) for every tuple', () => {
  const sut = assertFresh;
  const targetPage = 'docs/adapters/telemetry.md';
  const deps = corpusOf({ [targetPage]: page([OBS_GLOB]) });

  for (let i = 0; i < 8; i += 1) {
    const subjectChanged = (i & 1) !== 0;
    const touched = (i & 2) !== 0;
    const waivedFlag = (i & 4) !== 0;

    const change = {
      changed: subjectChanged ? [OBS_PATH] : [],
      touched: touched ? [targetPage] : [],
      waived: waivedFlag ? [targetPage] : [],
    };

    const result = sut(change, deps);
    const row = result.stale.find(r => r.page === targetPage);

    const isCandidate = subjectChanged && !touched;
    const isDriftWorthy = isCandidate && !waivedFlag;

    assert.equal(Boolean(row), isCandidate, `candidacy mismatch at i=${i}`);
    if (row) assert.equal(row.waived, waivedFlag, `waived flag mismatch at i=${i}`);
    assert.equal(Boolean(row && !row.waived), isDriftWorthy, `drift-worthy mismatch at i=${i}`);
  }
});
