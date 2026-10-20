'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { TO_END, sliceProse } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const RUN_SKILL = read('skills', 'run', 'SKILL.md');
const VALIDATION_SKILL = read('skills', 'validation', 'SKILL.md');
const INTENTION_SPEC = read('docs', 'contributing', 'specs', 'intention.md');
const RUN_RECORD_SPEC = read('docs', 'contributing', 'specs', 'run-record.md');

const LESSONS_HINT_START = /^ {3}\*\*Lessons hint \(advisory\)\./;
const NEXT_PHASE_MARKER = /^ {3}\*\*Phase-start marker\./;
const INT_LOAD_START = /^1c-int\. /;
const NEXT_STEP_1D = /^1d\. /;
const WALK_STEP_1_START = /^1\. \*\*Necessity probe/;
const WALK_STEP_2_START = /^2\. /;
const DOC_ROW_START = /^ *\| `documentation` \|/;
const NEXT_ROW_START = /^ *\| `(lessons|validation)` \|/;
const STEP_5_START = /^5\. \*\*Execute\*\*/;
const STEP_6_START = /^6\. \*\*Gate\*\*/;
const INVARIANTS_START = /^## Cross-phase invariants/;
const SPAWNS_START = /^- \*\*Agent spawns\*\*/;
const AFTER_SPAWNS = /^ {2}2\. \*\*Working directory/;
const RESUME_START = /^5\. \*\*Resume\.\*\*/;
const RESUME_END = /^6\. \*\*Walk from `next`/;
const VALIDATION_STEP_5_START = /^5\. \*\*Intention freshness/;
const GATE_NOTE_START = /^\*\*Gate-satisfaction note/;
const RUN_RECORD_REGEX_TABLE_START = /^\| Token \| Regex over/;
const GREPPABLE_ONLY_START = /^The tokens below are greppable only/;
const RUN_TOKENS_START = /^### Run-record tokens/;
const NEXT_H2 = /^## /;
const LESSON_TOKENS = ['LESSONS: <path>', 'NO-OP(lessons):', 'LESSON-REVERIFY(<lesson>):'];

const hint = () => sliceProse(RUN_SKILL, LESSONS_HINT_START, NEXT_PHASE_MARKER);

test('Given walk step 4, when read, then a Lessons hint prepends into the SAME slot-1 prepend at every phase', () => {
  const sut = hint();

  const result = ['At **every** phase entry', 'SAME slot-1 prepend', 'after the memory and intention hints',
    'the hint never gates'].filter((phrase) => !sut.includes(phrase));

  assert.deepStrictEqual(result, []);
});

test('Given the Lessons hint, when read, then it builds the block with the lessons-hint bin and its flags', () => {
  const sut = hint();

  const result = ['engine/bin/lessons-hint.js', '--phase <phase.id>', '--max <lessons.max_injected, default 3>',
    '--dir "<lessons-dir>"', 'git diff --name-only <base>...HEAD |'].filter((phrase) => !sut.includes(phrase));

  assert.deepStrictEqual(result, []);
});

test('Given the Lessons hint, when read, then only lessons merged into the default branch are injected', () => {
  const sut = hint();

  const result = ['only lessons merged into the default branch are injected', 'wait for ratification',
    'never reads lesson files itself'].filter((phrase) => !sut.includes(phrase));

  assert.deepStrictEqual(result, []);
});

test('Given the Lessons hint, when read, then it no longer enumerates the corpus or consults by hand', () => {
  const sut = hint();

  const result = ['governing-corpus.sh', 'listLessons', 'sliceLessons'].filter((phrase) => sut.includes(phrase));

  assert.deepStrictEqual(result, []);
});

test('Given the Lessons hint format block, when read, then it holds the index line followed by the How to apply line', () => {
  const sut = hint();

  const result = sut.indexOf('- <title> — when <trigger> → <path>');

  assert.ok(result >= 0);
  assert.ok(sut.indexOf('<How to apply, verbatim, at most 6 lines>') > result);
});

test('Given the Lessons hint, when read, then the frontmatter is never injected', () => {
  const sut = hint();

  const result = sut.includes('The frontmatter is never injected');

  assert.ok(result);
});

test('Given 1c-int and the Agent spawns slot 1, when read, then both name the lessons hint', () => {
  const sut = [sliceProse(RUN_SKILL, INT_LOAD_START, NEXT_STEP_1D), sliceProse(RUN_SKILL, SPAWNS_START, AFTER_SPAWNS)];

  const result = sut.map((region) => region.includes('lessons hint') || region.includes('Lessons hint'));

  assert.deepStrictEqual(result, [true, true]);
});

test('Given walk step 1, when read, then a lessons row names lesson-shaped events and LESSON-REVERIFY', () => {
  const sut = sliceProse(RUN_SKILL, WALK_STEP_1_START, WALK_STEP_2_START);

  const result = sut.match(/\| `lessons` \|[^|]*\|/);

  assert.ok(result);
  assert.match(result[0], /lesson-shaped event/);
  assert.match(result[0], /LESSON-REVERIFY\(/);
});

test('Given walk step 1, when the documentation row is read, then it does not mention lessons', () => {
  const sut = sliceProse(RUN_SKILL, DOC_ROW_START, NEXT_ROW_START);

  const result = /lesson/i.test(sut);

  assert.strictEqual(result, false);
});

test('Given walk step 5, when read, then a delivery lessons bullet waits for awaitingHarnesses', () => {
  const sut = sliceProse(RUN_SKILL, STEP_5_START, STEP_6_START);

  const result = sut.match(/- `delivery` \(`lessons`\):.*?(?= - `delivery` \(`propose`\))/);

  assert.ok(result);
  assert.match(result[0], /craft:lessons/);
  assert.match(result[0], /awaitingHarnesses/);
  assert.match(sut, /`workspace`\/`decisions`\/`lessons`\/`propose`\/`integrate`/);
});

test('Given the cross-phase invariants, when read, then lessons is never awaited', () => {
  const sut = sliceProse(RUN_SKILL, INVARIANTS_START, SPAWNS_START);

  const result = sut.includes('`lessons` may not parallel a background executing-harness');

  assert.ok(result);
  assert.match(sut, /is never itself awaited/);
});

test('Given the resume table, when read, then it has a lessons row', () => {
  const sut = sliceProse(RUN_SKILL, RESUME_START, RESUME_END);

  const result = sut.match(/\| `lessons` \|[^|]*\|[^|]*\|/);

  assert.ok(result);
  assert.match(result[0], /`LESSONS:` or `NO-OP\(lessons\):`/);
});

test('Given validation step 5, when read, then it emits LESSON-REVERIFY and says it never gates', () => {
  const sut = sliceProse(VALIDATION_SKILL, VALIDATION_STEP_5_START, GATE_NOTE_START);

  const result = ['listLessons', 'report.lessons[]', 'LESSON-REVERIFY(<lesson>): <changed-path>',
    'never join the drift set and never reach `intention.gate`'].filter((phrase) => !sut.includes(phrase));

  assert.deepStrictEqual(result, []);
});

test('Given both token registries, when read, then each lists LESSONS, NO-OP(lessons) and LESSON-REVERIFY', () => {
  const sut = [sliceProse(RUN_SKILL, RUN_TOKENS_START, NEXT_H2),
    sliceProse(RUN_RECORD_SPEC, GREPPABLE_ONLY_START, TO_END)];

  const result = sut.map((region) => LESSON_TOKENS.filter((token) => !region.includes(token)));

  assert.deepStrictEqual(result, [[], []]);
});

test('Given the run-record regex table, when read, then no row names a lessons token', () => {
  const sut = sliceProse(RUN_RECORD_SPEC, RUN_RECORD_REGEX_TABLE_START, GREPPABLE_ONLY_START);

  const result = /LESSON/.test(sut);

  assert.strictEqual(result, false);
});

test('Given the intention spec, when read, then it has a Lessons lane section', () => {
  const sut = sliceProse(INTENTION_SPEC, /^## Lessons lane/, /^## Custom recipes/);

  const result = ['listLessons', 'LessonRow', 'malformed-lesson', 'sliceLessons', 'lastVerified',
    'at most 6 non-empty lines', 'assertFresh().lessons[]', 'never in `stale[]`', 'never gated',
    'file-only lane'].filter((phrase) => !sut.includes(phrase));

  assert.deepStrictEqual(result, []);
  assert.match(INTENTION_SPEC, /^ {2}- engine\/src\/lesson\*\.js/m);
});
