'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { sliceRegion, TO_END } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const CUSTOMIZING_PATH = path.join(ROOT, 'docs/guides/customizing.md');
const SMOKES_PATH = path.join(ROOT, 'docs/contributing/maintainer-smokes.md');

const GUIDE_START = /^### Run progress — pane and status line \(Claude Code\)$/;
const GUIDE_END = /^#{2,3} |^---$/;
const SMOKE_START = /^## Run-progress mod smoke — not CI-gated$/;

const GUIDE_TOKENS = [
  '/craft-progress',
  'waiting on you',
  'waiting on background',
  'mods',
  'pipeline list unavailable',
];
const SMOKE_TOKENS = ['claude plugin validate', 'claude plugin test', '--plugin-dir', 'mods off'];

test('Given the customizing guide, when the run-progress subsection is sliced, then it names /craft-progress, the status line, the attention values and that mods must be on', () => {
  const sut = sliceRegion(fs.readFileSync(CUSTOMIZING_PATH, 'utf8'), GUIDE_START, GUIDE_END);

  for (const token of GUIDE_TOKENS) assert.ok(sut.includes(token), `missing ${token}`);
});

test('Given the maintainer smokes, when the run-progress smoke is sliced, then it names claude plugin validate, claude plugin test, --plugin-dir and the mods-off check', () => {
  const sut = sliceRegion(fs.readFileSync(SMOKES_PATH, 'utf8'), SMOKE_START, TO_END);

  for (const token of SMOKE_TOKENS) assert.ok(sut.includes(token), `missing ${token}`);
});
