'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { sliceRegion, TO_END } = require('./helpers/region-slice');

const ROOT = path.resolve(__dirname, '..');
const CUSTOMIZING_PATH = path.join(ROOT, 'docs/guides/customizing.md');
const SMOKES_PATH = path.join(ROOT, 'docs/contributing/maintainer-smokes.md');
const CI_WORKFLOW = path.join(ROOT, '.github/workflows/ci.yml');
const yaml = require(path.join(ROOT, 'engine/node_modules/js-yaml'));
const PINNED_CLAUDE = /^npm install -g @anthropic-ai\/claude-code@\d+\.\d+\.\d+$/m;

const GUIDE_START = /^### Run progress — status line \(Claude Code\)$/;
const GUIDE_END = /^#{2,3} |^---$/;
const SMOKE_START = /^## Run-progress mod smoke$/;

const GUIDE_TOKENS = [
  '■',
  '`next`',
  'waiting on you',
  'waiting on background',
  'mods',
  'craft <run-id>',
];
const GUIDE_GONE = ['/craft-progress', 'pane'];
const SMOKE_TOKENS = ['claude plugin validate', 'claude plugin test', '--plugin-dir', 'mods off'];

test('Given the customizing guide, when the run-progress subsection is sliced, then it names the bar, the attention values, the ledger-only line and that mods must be on, and no longer the pane', () => {
  const sut = sliceRegion(fs.readFileSync(CUSTOMIZING_PATH, 'utf8'), GUIDE_START, GUIDE_END);

  for (const token of GUIDE_TOKENS) assert.ok(sut.includes(token), `missing ${token}`);
  for (const token of GUIDE_GONE) assert.ok(!sut.includes(token), `still names ${token}`);
});

test('Given the maintainer smokes, when the run-progress smoke is sliced, then it names claude plugin validate, claude plugin test, --plugin-dir and the mods-off check', () => {
  const sut = sliceRegion(fs.readFileSync(SMOKES_PATH, 'utf8'), SMOKE_START, TO_END);

  for (const token of SMOKE_TOKENS) assert.ok(sut.includes(token), `missing ${token}`);
});

test('Given the CI workflow, when the ci job is read, then it installs a pinned claude and runs the mod validation and tests', () => {
  const workflow = yaml.load(fs.readFileSync(CI_WORKFLOW, 'utf8'));

  const sut = workflow.jobs.ci.steps.map(step => step.run ?? '').join('\n');

  assert.match(sut, PINNED_CLAUDE);
  assert.ok(sut.includes('claude plugin validate .'), 'missing claude plugin validate .');
  assert.ok(sut.includes('claude plugin test .'), 'missing claude plugin test .');
});
