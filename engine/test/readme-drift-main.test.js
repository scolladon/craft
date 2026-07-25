import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main } from '../src/readme-drift-main.js';

// ─── fixture building blocks ──────────────────────────────────────────────────

const MERMAID_BLOCK = [
  '```mermaid',
  'flowchart LR',
  '  A[alpha] --> B[beta] --> D[delta]',
  '```',
].join('\n');

const TIMELINE_BLOCK = [
  '```text',
  '/craft:run "example"',
  '',
  'alpha       → does one thing',
  'beta        → does another',
  'delta       → does a third',
  '```',
].join('\n');

function yamlBlock(pipelineLine) {
  return ['```yaml', 'pipeline:', `  ${pipelineLine}`, '```'].join('\n');
}

const CLEAN_YAML_BLOCK = yamlBlock('skip: [gamma]');
const BOGUS_YAML_BLOCK = yamlBlock('bogusKey: [gamma]');

const FAQ_SECTION = [
  '**What does a run cost?** Across the 3 telemetered runs that built this repo: the median',
  'run logs ≈1.5 hours of role-agent activity, from half an hour for a small change to ≈4 hours',
  'for the largest feature.',
].join('\n');

function readmeWithYaml(yaml) {
  return ['# fixture', '', MERMAID_BLOCK, '', TIMELINE_BLOCK, '', yaml, '', FAQ_SECTION, ''].join('\n');
}

const CLEAN_README = readmeWithYaml(CLEAN_YAML_BLOCK);
const BOGUS_KEY_README = readmeWithYaml(BOGUS_YAML_BLOCK);
const NO_YAML_README = ['# fixture', '', MERMAID_BLOCK, '', TIMELINE_BLOCK, '', FAQ_SECTION, ''].join('\n');

const CLEAN_DEFAULT_YML = [
  '- id: alpha',
  '  archetype: setup',
  '- id: beta',
  '  archetype: specification',
  '- id: gamma',
  '  archetype: specification',
  '  enabled: false',
  '- id: delta',
  '  archetype: specification',
  '',
].join('\n');

const RENAMED_PHASE_YML = CLEAN_DEFAULT_YML.replace('id: beta\n', 'id: betaa\n');

function report(betaDurationMs) {
  return JSON.stringify({
    schemaVersion: 1,
    recommendations: [],
    runs: [
      { run: 1, slug: 'a', reviewCycles: 1, groups: [{ durationMs: 1_800_000 }] },
      { run: 2, slug: 'b', reviewCycles: 1, groups: [{ durationMs: betaDurationMs }] },
      { run: 3, slug: 'c', reviewCycles: 1, groups: [{ durationMs: 14_400_000 }] },
    ],
  });
}

// median 1.5h (matches FAQ_SECTION's "≈1.5 hours")
const CLEAN_REPORT = report(5_400_000);
// median 1.75h -> rounds to 1.8, drifts from the README's claimed 1.5
const BUMPED_REPORT = report(6_300_000);

// ─── test helpers ──────────────────────────────────────────────────────────────

function captureIo() {
  const out = [];
  return {
    io: { stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => out.push(s) } },
    stdout: () => out.join(''),
  };
}

function withFixtureRoot(overrides, run) {
  const root = mkdtempSync(join(tmpdir(), 'readme-drift-'));
  try {
    mkdirSync(join(root, 'pipeline'), { recursive: true });
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'README.md'), overrides.readme ?? CLEAN_README);
    writeFileSync(join(root, 'pipeline', 'default.yml'), overrides.defaultYml ?? CLEAN_DEFAULT_YML);
    writeFileSync(join(root, 'docs', 'metrics-baseline.report.json'), overrides.report ?? CLEAN_REPORT);
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ─── cases ──────────────────────────────────────────────────────────────────────

test('Given a clean fixture tree, when main runs, then it returns 0 and writes no finding', () => {
  const sut = main;
  const cap = captureIo();

  const status = withFixtureRoot({}, (root) => sut([root], cap.io));

  assert.equal(status, 0);
  assert.equal(cap.stdout(), '');
});

test('Given a tree whose default.yml renames an enabled id, when main runs, then it returns 1 with phase-names findings naming the drifted id', () => {
  const sut = main;
  const cap = captureIo();

  const status = withFixtureRoot({ defaultYml: RENAMED_PHASE_YML }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /phase-names:mermaid/);
  assert.match(cap.stdout(), /phase-names:timeline/);
  assert.match(cap.stdout(), /beta/);
});

test('Given a tree whose README yaml block uses an unknown pipeline key, when main runs, then it returns 1 with a manifest-snippet finding naming the unknown key', () => {
  const sut = main;
  const cap = captureIo();

  const status = withFixtureRoot({ readme: BOGUS_KEY_README }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /manifest-snippet/);
  assert.match(cap.stdout(), /unknown pipeline key/);
});

test('Given a tree whose README has zero yaml blocks, when main runs, then it returns 1 with a manifest-snippet finding (absent input is drift)', () => {
  const sut = main;
  const cap = captureIo();

  const status = withFixtureRoot({ readme: NO_YAML_README }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /manifest-snippet/);
});

test('Given a tree whose report bumps a duration so the median rounds off, when main runs, then it returns 1 with a telemetry:median finding naming both values', () => {
  const sut = main;
  const cap = captureIo();

  const status = withFixtureRoot({ report: BUMPED_REPORT }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /telemetry:median/);
  assert.match(cap.stdout(), /1\.5/);
  assert.match(cap.stdout(), /1\.8/);
});

test('Given a tree with a renamed phase, an unknown snippet key, and a telemetry bump, when main runs, then stdout carries findings for all three surfaces and it returns 1', () => {
  const sut = main;
  const cap = captureIo();

  const status = withFixtureRoot(
    { defaultYml: RENAMED_PHASE_YML, readme: BOGUS_KEY_README, report: BUMPED_REPORT },
    (root) => sut([root], cap.io),
  );

  assert.equal(status, 1);
  assert.match(cap.stdout(), /phase-names/);
  assert.match(cap.stdout(), /manifest-snippet/);
  assert.match(cap.stdout(), /telemetry/);
});
