'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), 'utf8');

const lessonsGuide = read('docs', 'guides', 'lessons.md');
const customizing = read('docs', 'guides', 'customizing.md');
const concepts = read('docs', 'guides', 'concepts.md');
const docsIndex = read('docs', 'README.md');
const pluginDescription = JSON.parse(read('.claude-plugin', 'plugin.json')).description;

const BETWEEN = /documentation\s*(?:→|->)\s*lessons\s*(?:→|->)\s*propose/;

test('Given the lessons guide, when read, then it names paths.lessons, lessons.max_injected and pipeline.skip [lessons]', () => {
  const sut = lessonsGuide;

  const result = ['paths.lessons', 'lessons.max_injected', 'pipeline.skip: [lessons]'].filter(
    (key) => !sut.includes(key)
  );

  assert.deepStrictEqual(result, []);
});

test('Given the lessons guide, when read, then it states lessons never gate a phase', () => {
  const sut = lessonsGuide;

  const result = /never gate/i.test(sut);

  assert.strictEqual(result, true);
});

test('Given the customizing guide Ports table, when read, then it has a lessons row', () => {
  const sut = customizing;

  const result = /^\| \*\*lessons\*\* \*\(Tier 0\)\*/m.test(sut);

  assert.strictEqual(result, true);
});

test('Given the customizing sequence block, when read, then lessons sits between documentation and propose', () => {
  const sut = customizing.match(/```\nworkspace[\s\S]*?```/)[0].replace(/\s+/g, ' ');

  const result = BETWEEN.test(sut);

  assert.strictEqual(result, true);
});

test('Given the concepts walk, when read, then lessons sits between documentation and propose', () => {
  const sut = concepts;

  const result = BETWEEN.test(sut);

  assert.strictEqual(result, true);
});

test('Given the plugin description, when read, then lessons sits between documentation and propose', () => {
  const sut = pluginDescription;

  const result = BETWEEN.test(sut);

  assert.strictEqual(result, true);
});

test('Given the docs index, when read, then it links the lessons guide', () => {
  const sut = docsIndex;

  const result = sut.includes('guides/lessons.md');

  assert.strictEqual(result, true);
});
