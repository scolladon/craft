'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sliceRegion } = require('./helpers/region-slice');

const ROOT = path.join(__dirname, '..');
const live = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const SECTION_HEADING = '## Every run teaches the next';
const PRECEDING_HEADING = '## What a run looks like';
const FOLLOWING_HEADING = '## What it costs, measured';
const BUILDS_HEADING = '## craft builds craft';
const GUIDE_LINK = 'docs/guides/lessons.md';
const LESSONS_DIR = 'docs/contributing/lessons/';
const MERMAID_FENCE = '```mermaid';
const ANY_DIGIT = /\d/;
const ANY_HTTP = /https?:/;

const NEXT_SECTION = /^## /;
const sectionOf = heading => sliceRegion(live, new RegExp(`^${heading}$`), NEXT_SECTION);

const section = sectionOf(SECTION_HEADING);
const linkTargets = text => [...text.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]);

test('Given the README, when its sections are located, then the loop section sits between What a run looks like and What it costs, measured', () => {
  const sut = heading => live.indexOf(heading);

  const result = [sut(PRECEDING_HEADING), sut(SECTION_HEADING), sut(FOLLOWING_HEADING)];

  assert.ok(result[0] !== -1 && result[0] < result[1] && result[1] < result[2], result.join(','));
});

test('Given the loop section, when scanned, then it holds no digit and no http link', () => {
  const sut = section;

  const result = [ANY_DIGIT.test(sut), ANY_HTTP.test(sut)];

  assert.deepStrictEqual(result, [false, false]);
});

test('Given the loop section, when scanned, then it holds one mermaid block naming the lessons phase', () => {
  const sut = section;

  const result = sut.split(MERMAID_FENCE).length - 1;

  assert.strictEqual(result, 1);
  assert.ok(sut.includes('LP[lessons phase]'));
});

test('Given the README, when its first mermaid block is located, then it starts before the loop section', () => {
  const sut = live.indexOf(MERMAID_FENCE);

  const result = live.indexOf(SECTION_HEADING);

  assert.ok(sut !== -1 && sut < result);
});

test('Given the loop section, when its links are read, then it links the lessons guide and that file exists', () => {
  const sut = linkTargets(section);

  const result = sut.includes(GUIDE_LINK) && fs.existsSync(path.join(ROOT, GUIDE_LINK));

  assert.strictEqual(result, true);
});

test('Given the default pipeline, when the lessons descriptor is read, then it declares no gate and no harness', async () => {
  const { parsePipeline } = await import(pathToFileURL(path.join(ROOT, 'engine/src/descriptor.js')).href);
  const sut = parsePipeline(fs.readFileSync(path.join(ROOT, 'pipeline/default.yml'), 'utf8'));

  const result = sut.find(d => d.id === 'lessons');

  assert.ok(result);
  assert.strictEqual(result.gate, undefined);
  assert.strictEqual(result.harness, undefined);
});

test('Given the craft builds craft section, when read, then it holds a counted link to the lessons directory and that directory exists', () => {
  const sut = sectionOf(BUILDS_HEADING);

  const result = linkTargets(sut).includes(LESSONS_DIR) && fs.existsSync(path.join(ROOT, LESSONS_DIR));

  assert.strictEqual(result, true);
  assert.match(sut, /\[\d+ lessons?\]\(docs\/contributing\/lessons\/\)/);
});
