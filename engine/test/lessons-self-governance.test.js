import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { load } from 'js-yaml';

import { consult, sliceLessons } from '../src/intention.js';
import { LESSON_SECTIONS, MAX_HOW_TO_APPLY_LINES } from '../src/lesson.js';
import { extractFrontmatter } from '../src/frontmatter.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LESSON = 'docs/contributing/lessons/001-stryker-repeated-mutate-flag-keeps-last.md';
const TEMPLATE = 'templates/lesson.md';
const REQUIRED_KEYS = ['subjects', 'phases', 'kind', 'trigger', 'evidence', 'source', 'status', 'supersedes', 'last-verified'];
const MAX_SLICE = 3;

const readRepoFile = path => readFileSync(resolve(ROOT, path), 'utf8');
const readPage = page => (page === LESSON ? readRepoFile(LESSON) : null);
const deps = { listCorpus: () => [], listLessons: () => [LESSON], readPage };

function howToApplyOf(content) {
  const after = content.split('\n## How to apply\n')[1];
  return after.split('\n## ')[0];
}

test('Given the lesson template, when its body is read, then it carries the four sections in order', () => {
  const sut = readRepoFile(TEMPLATE);

  const result = [...sut.matchAll(/^## (.+)$/gm)].map(match => match[1]);

  assert.deepEqual(result, [...LESSON_SECTIONS]);
});

test('Given the lesson template, when its frontmatter is loaded, then it carries every required key', () => {
  const sut = readRepoFile(TEMPLATE);

  const result = Object.keys(load(extractFrontmatter(sut)));

  assert.deepEqual(result, REQUIRED_KEYS);
});

test('Given the seed lesson and a change to engine source, when consult and sliceLessons run for validation, then the slice holds its row with trigger and How to apply', () => {
  const sut = consult;

  const view = sut(['engine/src/intention.js'], deps);
  const result = sliceLessons(view.lessons, { phase: 'validation', max: MAX_SLICE });

  assert.equal(result.length, 1);
  assert.equal(result[0].path, LESSON);
  assert.match(result[0].trigger, /per-hunk Stryker run/);
  assert.match(result[0].howToApply, /ONE comma-joined flag/);
});

test('Given the seed lesson, when its How to apply is counted, then it holds at most 6 non-empty lines', () => {
  const sut = howToApplyOf(readRepoFile(LESSON));

  const result = sut.split('\n').filter(line => line.trim() !== '').length;

  assert.ok(result > 0 && result <= MAX_HOW_TO_APPLY_LINES);
});

test('Given the seed lesson, when sliced for the design phase, then the slice is empty', () => {
  const sut = sliceLessons;
  const view = consult(['engine/src/intention.js'], deps);
  assert.equal(view.lessons.length, 1);

  const result = sut(view.lessons, { phase: 'design', max: MAX_SLICE });

  assert.deepEqual(result, []);
});

test('Given a scope outside the lesson subjects, when consult runs, then lessons is empty', () => {
  const sut = consult;
  assert.equal(sut(['engine/src/intention.js'], deps).lessons.length, 1);

  const result = sut(['docs/guides/lessons.md'], deps).lessons;

  assert.deepEqual(result, []);
});
