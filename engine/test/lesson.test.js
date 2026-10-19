import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseLesson, evidencePath, LESSON_KINDS, LESSON_STATUSES, LESSON_SECTIONS, MAX_HOW_TO_APPLY_LINES, MAX_LESSON_LINE_CHARS, MAX_TRIGGER_CHARS, MAX_TITLE_CHARS } from '../src/lesson.js';

const EM_DASH = '—';

const BASE_FRONTMATTER = {
  subjects: "['engine/src/**']",
  phases: '[validation]',
  kind: 'trap',
  trigger: 'running a scoped mutation',
  evidence: "['README.md']",
  source: '{ run: some-run, phase: design, date: 2026-10-19 }',
  status: 'active',
  'last-verified': '2026-10-19',
};

function sectionsBody({ howToApply = 'Do the thing.' } = {}) {
  return [
    `# 001 ${EM_DASH} A title`,
    '',
    '## Context',
    'Why.',
    '',
    '## Lesson',
    'What.',
    '',
    '## How to apply',
    howToApply,
    '',
    '## Evidence',
    'Where.',
    '',
  ].join('\n');
}

function lessonText({ frontmatter = {}, body = sectionsBody() } = {}) {
  const merged = { ...BASE_FRONTMATTER, ...frontmatter };
  const lines = Object.entries(merged)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`);
  return ['---', ...lines, '---', '', body].join('\n');
}

test('Given a valid lesson, when parseLesson runs, then it returns the lesson with every field', () => {
  const sut = parseLesson;

  const result = sut(lessonText());

  assert.deepEqual(result, {
    lesson: {
      subjects: ['engine/src/**'],
      phases: ['validation'],
      kind: 'trap',
      trigger: 'running a scoped mutation',
      evidence: ['README.md'],
      source: { run: 'some-run', phase: 'design', date: '2026-10-19' },
      status: 'active',
      supersedes: [],
      lastVerified: '2026-10-19',
      number: 1,
      title: 'A title',
      sections: {
        Context: 'Why.',
        Lesson: 'What.',
        'How to apply': 'Do the thing.',
        Evidence: 'Where.',
      },
    },
  });
});

test('Given the exported vocabularies, when read, then they hold the lesson enums', () => {
  const result = [LESSON_KINDS, LESSON_STATUSES, LESSON_SECTIONS, MAX_HOW_TO_APPLY_LINES];

  assert.deepEqual([...result[0]], ['trap', 'technique', 'gotcha', 'anti-pattern']);
  assert.deepEqual([...result[1]], ['active', 'superseded', 'retired']);
  assert.deepEqual([...result[2]], ['Context', 'Lesson', 'How to apply', 'Evidence']);
  assert.equal(result[3], 6);
});

test('Given content with no frontmatter, when parseLesson runs, then it reports missing frontmatter', () => {
  const sut = parseLesson;

  const result = sut('# 001 plain\n');

  assert.equal(result.reason, 'malformed-lesson');
  assert.deepEqual(result.errors, ['missing frontmatter']);
});

test('Given mis-typed YAML frontmatter, when parseLesson runs, then it reports malformed YAML and does not throw', () => {
  const sut = parseLesson;
  const content = ['---', 'subjects: [unclosed', '---', '', sectionsBody()].join('\n');

  const result = sut(content);

  assert.equal(result.reason, 'malformed-lesson');
  assert.match(result.errors[0], /^malformed YAML frontmatter: /);
});

test('Given a frontmatter that is not a mapping, when parseLesson runs, then it reports the mapping rule', () => {
  const sut = parseLesson;
  const content = ['---', '- a', '- b', '---', '', sectionsBody()].join('\n');

  const result = sut(content);

  assert.deepEqual(result.errors, ['frontmatter must be a mapping']);
});

for (const key of ['subjects', 'phases', 'kind', 'trigger', 'evidence', 'source', 'status', 'last-verified']) {
  test(`Given a lesson missing ${key}, when parseLesson runs, then the error names ${key}`, () => {
    const sut = parseLesson;

    const result = sut(lessonText({ frontmatter: { [key]: undefined } }));

    assert.equal(result.reason, 'malformed-lesson');
    assert.ok(result.errors.some(e => e.includes(key)), result.errors.join('|'));
  });
}

test('Given two defects, when parseLesson runs, then both errors are collected', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { kind: 'nope', status: 'nope' } }));

  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.some(e => e.includes('kind')));
  assert.ok(result.errors.some(e => e.includes('status')));
});

test('Given kind outside the enum, when parseLesson runs, then the error names kind', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { kind: 'bogus' } }));

  assert.deepEqual(result.errors.length, 1);
  assert.match(result.errors[0], /kind/);
});

test('Given status outside the enum, when parseLesson runs, then the error names status', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { status: 'bogus' } }));

  assert.deepEqual(result.errors.length, 1);
  assert.match(result.errors[0], /status/);
});

test('Given phases naming an unknown id, when parseLesson runs, then the error names that id', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { phases: '[validation, warp]' } }));

  assert.deepEqual(result.errors, ['unknown phase: warp']);
});

test('Given phases [lessons], when parseLesson runs, then it is accepted', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { phases: '[lessons]' } }));

  assert.deepEqual(result.lesson.phases, ['lessons']);
});

test('Given a multi-line trigger, when parseLesson runs, then the error names trigger', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { trigger: '"first\\nsecond"' } }));

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /trigger/);
});

test('Given supersedes [0], when parseLesson runs, then the error names supersedes', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { supersedes: '[0]' } }));

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /supersedes/);
});

test('Given supersedes [1], when parseLesson runs, then it is accepted', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { supersedes: '[1]' } }));

  assert.deepEqual(result.lesson.supersedes, [1]);
});

const BAD_EVIDENCE = [
  ['an absolute path', "['/etc/passwd']"],
  ['a home path', "['~/x']"],
  ['a parent segment', "['a/../b']"],
  ['a variable', "['$HOME/x']"],
  ['a 40-hex sha', "['0123456789abcdef0123456789abcdef01234567']"],
];

for (const [shape, yaml] of BAD_EVIDENCE) {
  test(`Given evidence ${shape}, when parseLesson runs, then the entry is rejected as not a repo path`, () => {
    const sut = parseLesson;

    const result = sut(lessonText({ frontmatter: { evidence: yaml } }));

    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /^evidence entry is not a repo path: /);
  });
}

test('Given evidence with a line or a line range suffix, when parseLesson runs, then it is accepted', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { evidence: "['a/b.js:3', 'a/b.js:3-9']" } }));

  assert.deepEqual(result.lesson.evidence, ['a/b.js:3', 'a/b.js:3-9']);
});

test('Given an empty evidence list, when parseLesson runs, then the error names evidence', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { evidence: '[]' } }));

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /evidence/);
});

for (const entry of ['a/b.js:3-9', 'a/b.js:3', 'a/b.js']) {
  test(`Given the entry ${entry} with or without a line range, when evidencePath runs, then it returns the path part`, () => {
    const sut = evidencePath;

    const result = sut(entry);

    assert.equal(result, 'a/b.js');
  });
}

test('Given an unquoted last-verified date, when parseLesson runs, then lastVerified is the YYYY-MM-DD string', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { 'last-verified': '2026-10-20' } }));

  assert.equal(result.lesson.lastVerified, '2026-10-20');
});

test('Given a quoted last-verified string, when parseLesson runs, then it is kept as is', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { 'last-verified': '"2026-10-21"' } }));

  assert.equal(result.lesson.lastVerified, '2026-10-21');
});

test('Given an unquoted source date, when parseLesson runs, then source.date is the YYYY-MM-DD string', () => {
  const sut = parseLesson;

  const result = sut(lessonText());

  assert.equal(result.lesson.source.date, '2026-10-19');
});

test('Given last-verified earlier than source.date, when parseLesson runs, then the error names last-verified', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { 'last-verified': '2026-10-18' } }));

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /last-verified/);
});

test('Given a body with no numbered H1, when parseLesson runs, then the error names the H1', () => {
  const sut = parseLesson;
  const body = sectionsBody().replace(/^# .*$/m, '# A title without number');

  const result = sut(lessonText({ body }));

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /H1/);
});

test('Given sections out of order, when parseLesson runs, then the error names the sections', () => {
  const sut = parseLesson;
  const body = sectionsBody().replace('## Context', '## TMP').replace('## Lesson', '## Context').replace('## TMP', '## Lesson');

  const result = sut(lessonText({ body }));

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /sections/);
});

test('Given a missing section, when parseLesson runs, then the error names the sections', () => {
  const sut = parseLesson;
  const body = sectionsBody().replace('## Evidence\nWhere.\n', '');

  const result = sut(lessonText({ body }));

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /sections/);
});

test('Given How to apply with 7 non-empty lines, when parseLesson runs, then the error names How to apply', () => {
  const sut = parseLesson;
  const howToApply = Array.from({ length: 7 }, (_, i) => `step ${i}`).join('\n');

  const result = sut(lessonText({ body: sectionsBody({ howToApply }) }));

  assert.deepEqual(result.errors, ['How to apply holds 7 non-empty lines (max 6)']);
});

test('Given How to apply with 6 non-empty lines and blank lines between them, when parseLesson runs, then it is accepted', () => {
  const sut = parseLesson;
  const howToApply = Array.from({ length: 6 }, (_, i) => `step ${i}`).join('\n\n');

  const result = sut(lessonText({ body: sectionsBody({ howToApply }) }));

  assert.equal(result.errors, undefined);
  assert.ok(result.lesson);
});

test('Given a valid lesson, when parseLesson runs, then sections How to apply is the trimmed section text', () => {
  const sut = parseLesson;
  const body = sectionsBody({ howToApply: '\n\nfirst\n\nsecond\n\n' });

  const result = sut(lessonText({ body }));

  assert.equal(result.lesson.sections['How to apply'], 'first\n\nsecond');
});

test('Given a non-string and non-date source date, when parseLesson runs, then the error names source', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { source: '{ run: some-run, phase: design, date: soon }' } }));

  assert.ok(result.errors.some(e => e.includes('source')));
  assert.equal(result.reason, 'malformed-lesson');
});

test('Given a source with a non-kebab run and an unknown phase, when parseLesson runs, then both are named', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { source: '{ run: Bad_Run, phase: warp, date: 2026-10-19 }' } }));

  assert.ok(result.errors.some(e => e.includes('source.run')));
  assert.ok(result.errors.some(e => e.includes('source.phase')));
});

test('Given How to apply holding a fenced ## line, when parseLesson runs, then it is accepted and the line stays in How to apply', () => {
  const sut = parseLesson;
  const howToApply = ['```', '## Not a heading', '```'].join('\n');

  const result = sut(lessonText({ body: sectionsBody({ howToApply }) }));

  assert.equal(result.errors, undefined);
  assert.ok(result.lesson.sections['How to apply'].includes('## Not a heading'));
});

test('Given How to apply holding a tilde-fenced ## line, when parseLesson runs, then it is accepted', () => {
  const sut = parseLesson;
  const howToApply = ['~~~', '## Not a heading', '~~~'].join('\n');

  const result = sut(lessonText({ body: sectionsBody({ howToApply }) }));

  assert.equal(result.errors, undefined);
});

test('Given a fence of 6 lines plus fence lines, when parseLesson runs, then fence lines count toward the cap', () => {
  const sut = parseLesson;
  const howToApply = ['```', 'a', 'b', 'c', 'd', 'e', '```'].join('\n');

  const result = sut(lessonText({ body: sectionsBody({ howToApply }) }));

  assert.deepEqual(result.errors, ['How to apply holds 7 non-empty lines (max 6)']);
});

test('Given a How to apply line over the char cap, when parseLesson runs, then a form error names the cap', () => {
  const sut = parseLesson;
  const howToApply = 'x'.repeat(MAX_LESSON_LINE_CHARS + 1);

  const result = sut(lessonText({ body: sectionsBody({ howToApply }) }));

  assert.deepEqual(result.errors, [`How to apply line exceeds ${MAX_LESSON_LINE_CHARS} characters`]);
});

test('Given a How to apply line at the char cap, when parseLesson runs, then it is accepted', () => {
  const sut = parseLesson;
  const howToApply = 'x'.repeat(MAX_LESSON_LINE_CHARS);

  const result = sut(lessonText({ body: sectionsBody({ howToApply }) }));

  assert.equal(result.errors, undefined);
});

test('Given a trigger over the char cap, when parseLesson runs, then a form error names the cap', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { trigger: 'x'.repeat(MAX_TRIGGER_CHARS + 1) } }));

  assert.deepEqual(result.errors, [`trigger exceeds ${MAX_TRIGGER_CHARS} characters`]);
});

test('Given a trigger at the char cap, when parseLesson runs, then it is accepted', () => {
  const sut = parseLesson;

  const result = sut(lessonText({ frontmatter: { trigger: 'x'.repeat(MAX_TRIGGER_CHARS) } }));

  assert.equal(result.errors, undefined);
});

test('Given a title over the char cap, when parseLesson runs, then a form error names the cap', () => {
  const sut = parseLesson;
  const body = sectionsBody().replace('A title', 'x'.repeat(MAX_TITLE_CHARS + 1));

  const result = sut(lessonText({ body }));

  assert.deepEqual(result.errors, [`title exceeds ${MAX_TITLE_CHARS} characters`]);
});

test('Given a title at the char cap, when parseLesson runs, then it is accepted', () => {
  const sut = parseLesson;
  const body = sectionsBody().replace('A title', 'x'.repeat(MAX_TITLE_CHARS));

  const result = sut(lessonText({ body }));

  assert.equal(result.errors, undefined);
});

for (const glob of ['*', '?', '[', ']', '{', '}']) {
  test(`Given an evidence entry holding the glob character ${glob}, when parseLesson runs, then it is not a repo path`, () => {
    const sut = parseLesson;

    const result = sut(lessonText({ frontmatter: { evidence: `["engine/a${glob}b.js"]` } }));

    assert.deepEqual(result.errors, [`evidence entry is not a repo path: engine/a${glob}b.js`]);
  });
}
