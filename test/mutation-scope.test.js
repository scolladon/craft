'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(ROOT, '.claude', 'workflow.md');
const STRYKER_CLI = path.join(ROOT, 'engine', 'node_modules', '@stryker-mutator',
  'core', 'dist', 'src', 'stryker-cli.js');

async function parsedMutate(flags) {
  const { StrykerCli } = await import(pathToFileURL(STRYKER_CLI).href);
  let captured;
  const cli = new StrykerCli(['node', 'stryker', 'run', ...flags], undefined,
    async (options) => { captured = options; });
  cli.run();
  return captured.mutate;
}

test('workflow.md documents per-hunk scope as ONE comma-joined --mutate flag', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf8');
  // Pins the exact combined single-flag form: --mutate "fileA:r1,fileB:r2"
  // Two separate --mutate flags cannot satisfy this; the comma must be INSIDE
  // the single quoted argument, not between two independent --mutate occurrences.
  assert.ok(
    content.includes('--mutate "fileA:r1,fileB:r2"'),
    'Expected a single --mutate "fileA:r1,fileB:r2" contract sentence in .claude/workflow.md'
  );
});

test('workflow.md documents the mutant-count plausibility check before trusting a green', () => {
  const content = fs.readFileSync(WORKFLOW, 'utf8');
  assert.ok(
    content.includes('instrumented mutant count is >= the adjacent-hunk count'),
    'Expected mutant-count plausibility guidance in .claude/workflow.md'
  );
});

test('Given two --mutate flags, when the Stryker CLI parses them, then only the last range survives', async () => {
  const flags = ['--mutate', 'a.js:1-2', '--mutate', 'b.js:3-4'];

  const result = await parsedMutate(flags);

  assert.deepStrictEqual(result, ['b.js:3-4']);
});

test('Given one comma-joined --mutate flag, when the Stryker CLI parses it, then both ranges survive', async () => {
  const flags = ['--mutate', 'a.js:1-2,b.js:3-4'];

  const result = await parsedMutate(flags);

  assert.deepStrictEqual(result, ['a.js:1-2', 'b.js:3-4']);
});
