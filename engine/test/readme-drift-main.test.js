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

// A shortest run under 15 minutes (0.1h = 360,000ms) exercises minLabel's
// under-N-minutes branch instead of the 'half an hour' one — telemetry:min
// must stay clean when the README already carries the matching minute phrase.
const MIN_UNDER_TEN_FAQ_SECTION = [
  '**What does a run cost?** Across the 3 telemetered runs that built this repo: the median',
  'run logs ≈1.5 hours of role-agent activity, from under 10 minutes for a small change to ≈4 hours',
  'for the largest feature.',
].join('\n');
const MIN_UNDER_TEN_README = [
  '# fixture', '', MERMAID_BLOCK, '', TIMELINE_BLOCK, '', CLEAN_YAML_BLOCK, '', MIN_UNDER_TEN_FAQ_SECTION, '',
].join('\n');
const MIN_UNDER_TEN_REPORT = JSON.stringify({
  schemaVersion: 1,
  recommendations: [],
  runs: [
    { run: 1, slug: 'a', reviewCycles: 1, groups: [{ durationMs: 360_000 }] },
    { run: 2, slug: 'b', reviewCycles: 1, groups: [{ durationMs: 5_400_000 }] },
    { run: 3, slug: 'c', reviewCycles: 1, groups: [{ durationMs: 14_400_000 }] },
  ],
});

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
    mkdirSync(join(root, 'docs', 'contributing'), { recursive: true });
    writeFileSync(join(root, 'README.md'), overrides.readme ?? CLEAN_README);
    writeFileSync(join(root, 'pipeline', 'default.yml'), overrides.defaultYml ?? CLEAN_DEFAULT_YML);
    writeFileSync(
      join(root, 'docs', 'contributing', 'metrics-baseline.report.json'),
      overrides.report ?? CLEAN_REPORT
    );
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

test('Given a report whose shortest run is under 15 minutes and a README min claim phrased as a minute count, when main runs, then it returns 0 and writes no finding (clean under-the-minute-threshold path, not just half-an-hour)', () => {
  const sut = main;
  const cap = captureIo();

  const status = withFixtureRoot(
    { readme: MIN_UNDER_TEN_README, report: MIN_UNDER_TEN_REPORT },
    (root) => sut([root], cap.io),
  );

  assert.equal(status, 0, `expected clean; got: ${cap.stdout()}`);
  assert.equal(cap.stdout(), '');
});

test('Given a tree whose README yaml block is syntactically invalid YAML, when main runs, then it returns 1 with a manifest-snippet finding instead of throwing', () => {
  const sut = main;
  const cap = captureIo();
  const malformedYamlReadme = readmeWithYaml(['```yaml', 'pipeline: [unterminated', '```'].join('\n'));

  const status = withFixtureRoot({ readme: malformedYamlReadme }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /manifest-snippet/);
  assert.match(cap.stdout(), /malformed YAML/);
});

test('Given a tree whose README yaml block is empty, when main runs, then it returns 1 with a manifest-snippet finding (blank snippet is drift)', () => {
  const sut = main;
  const cap = captureIo();
  const emptyYamlReadme = readmeWithYaml(['```yaml', '```'].join('\n'));

  const status = withFixtureRoot({ readme: emptyYamlReadme }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /manifest-snippet/);
  assert.match(cap.stdout(), /empty yaml block/);
});

test('Given a default.yml carrying an enabled id absent from the README, when main runs, then both surfaces report it as missing (pure-missing wording)', () => {
  const sut = main;
  const cap = captureIo();
  const pureMissingYml = `${CLEAN_DEFAULT_YML}- id: epsilon\n  archetype: delivery\n`;

  const status = withFixtureRoot({ defaultYml: pureMissingYml }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /phase-names:mermaid: missing epsilon/);
  assert.match(cap.stdout(), /phase-names:timeline: missing epsilon/);
  assert.doesNotMatch(cap.stdout(), /extra/);
});

test('Given a default.yml missing an id the README still lists, when main runs, then both surfaces report it as extra (pure-extra wording)', () => {
  const sut = main;
  const cap = captureIo();
  const pureExtraYml = CLEAN_DEFAULT_YML.replace('- id: delta\n  archetype: specification\n', '');

  const status = withFixtureRoot({ defaultYml: pureExtraYml }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /phase-names:mermaid: extra delta/);
  assert.match(cap.stdout(), /phase-names:timeline: extra delta/);
  assert.doesNotMatch(cap.stdout(), /missing/);
});

test('Given a report whose runs all sum to zero duration, when main runs, then it returns 1 with a telemetry unusable-input finding instead of NaN output', () => {
  const sut = main;
  const cap = captureIo();
  const zeroDurationReport = JSON.stringify({
    schemaVersion: 1,
    recommendations: [],
    runs: [{ run: 1, slug: 'a', reviewCycles: 1, groups: [{ durationMs: 0 }] }],
  });

  const status = withFixtureRoot({ report: zeroDurationReport }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /telemetry: unusable input/);
  assert.match(cap.stdout(), /no duration-bearing runs/);
});

test('Given a report file that is not valid JSON, when main runs, then it returns 1 with a telemetry unusable-input finding instead of a stack trace', () => {
  const sut = main;
  const cap = captureIo();

  const status = withFixtureRoot({ report: '{not json' }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /telemetry: unusable input/);
});

test('Given a root with no README at all, when main runs, then it returns 1 with a readme unusable-input finding instead of throwing', () => {
  const sut = main;
  const cap = captureIo();
  const bareRoot = mkdtempSync(join(tmpdir(), 'readme-drift-'));

  try {
    const status = sut([bareRoot], cap.io);

    assert.equal(status, 1);
    assert.match(cap.stdout(), /readme: unusable input/);
  } finally {
    rmSync(bareRoot, { recursive: true, force: true });
  }
});

test('Given one sub-guard with unusable input and another with real drift, when main runs, then stdout carries both findings (run-all survives a throw)', () => {
  const sut = main;
  const cap = captureIo();

  const status = withFixtureRoot(
    { report: '{not json', defaultYml: RENAMED_PHASE_YML },
    (root) => sut([root], cap.io),
  );

  assert.equal(status, 1);
  assert.match(cap.stdout(), /telemetry: unusable input/);
  assert.match(cap.stdout(), /phase-names/);
});

test('Given no root argument, when main runs, then it resolves DEFAULT_ROOT against the real repo root and finds no unusable-input errors', () => {
  const sut = main;
  const cap = captureIo();

  const status = sut([], cap.io);

  assert.equal(status, 0);
  assert.equal(cap.stdout(), '');
});

test('Given a tree whose README yaml block is whitespace-only, when main runs, then it returns 1 with a manifest-snippet finding (blank-after-trim is still empty)', () => {
  const sut = main;
  const cap = captureIo();
  const whitespaceYamlReadme = readmeWithYaml(['```yaml', '   ', '```'].join('\n'));

  const status = withFixtureRoot({ readme: whitespaceYamlReadme }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /manifest-snippet/);
  assert.match(cap.stdout(), /empty yaml block/);
});

test('Given a default.yml carrying two enabled ids absent from the README, when main runs, then both surfaces join them with a comma-space (list-join wording)', () => {
  const sut = main;
  const cap = captureIo();
  const multiMissingYml = `${CLEAN_DEFAULT_YML}- id: epsilon\n  archetype: delivery\n- id: zeta\n  archetype: delivery\n`;

  const status = withFixtureRoot({ defaultYml: multiMissingYml }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /phase-names:mermaid: missing epsilon, zeta/);
  assert.match(cap.stdout(), /phase-names:timeline: missing epsilon, zeta/);
});

test('Given a README that lists two ids absent from default.yml, when main runs, then both surfaces join them with a comma-space (list-join wording)', () => {
  const sut = main;
  const cap = captureIo();
  const extraMermaid = [
    '```mermaid',
    'flowchart LR',
    '  A[alpha] --> B[beta] --> D[delta] --> X[xray] --> Y[yankee]',
    '```',
  ].join('\n');
  const extraTimeline = [
    '```text',
    '/craft:run "example"',
    '',
    'alpha       → does one thing',
    'beta        → does another',
    'delta       → does a third',
    'xray        → does a fourth',
    'yankee      → does a fifth',
    '```',
  ].join('\n');
  const extraIdsReadme = ['# fixture', '', extraMermaid, '', extraTimeline, '', CLEAN_YAML_BLOCK, '', FAQ_SECTION, ''].join('\n');

  const status = withFixtureRoot({ readme: extraIdsReadme }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /phase-names:mermaid: extra xray, yankee/);
  assert.match(cap.stdout(), /phase-names:timeline: extra xray, yankee/);
});

test('Given a tree whose pipeline/default.yml is malformed YAML, when main runs, then it returns 1 with a phase-names unusable-input finding naming the surface', () => {
  const sut = main;
  const cap = captureIo();
  const malformedDefaultYml = '- id: alpha\n[unterminated';

  const status = withFixtureRoot({ defaultYml: malformedDefaultYml }, (root) => sut([root], cap.io));

  assert.equal(status, 1);
  assert.match(cap.stdout(), /phase-names: unusable input/);
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

// ─── corpus counts ───────────────────────────────────────────────────────────

// The receipts sentence advertises each committed corpus by size. Those numbers
// are hand-maintained and drift on every run that adds a doc, so this sub-guard
// counts the tree instead of trusting the sentence.
function readmeClaiming(count) {
  return [CLEAN_README, '', `receipts: [${count} ADRs](docs/contributing/adr/)`, ''].join('\n');
}

function withAdrFixture(overrides, run) {
  return withFixtureRoot(overrides, (root) => {
    const dir = join(root, 'docs', 'contributing', 'adr');
    mkdirSync(dir, { recursive: true });
    for (const name of overrides.adrFiles ?? []) writeFileSync(join(dir, name), 'x');
    return run(root);
  });
}

test('Given a claimed corpus count that matches the files on disk, when main runs, then it returns 0 and writes no finding', () => {
  const sut = main;
  const { io, stdout } = captureIo();

  const result = withAdrFixture(
    { readme: readmeClaiming(2), adrFiles: ['001-a.md', '002-b.md'] },
    (root) => sut([root], io)
  );

  assert.equal(result, 0);
  assert.equal(stdout(), '');
});

test('Given a claimed corpus count that has drifted from the tree, when main runs, then it returns 1 and names the directory with both counts', () => {
  const sut = main;
  const { io, stdout } = captureIo();

  const result = withAdrFixture(
    { readme: readmeClaiming(270), adrFiles: ['001-a.md', '002-b.md'] },
    (root) => sut([root], io)
  );

  assert.equal(result, 1);
  assert.match(stdout(), /corpus-counts: docs\/contributing\/adr\/ claims 270, tree holds 2/);
});

test('Given only non-markdown files beside the markdown ones, when main runs, then they are not counted toward the claim', () => {
  const sut = main;
  const { io } = captureIo();

  const result = withAdrFixture(
    { readme: readmeClaiming(1), adrFiles: ['001-a.md', 'notes.txt', '.keep'] },
    (root) => sut([root], io)
  );

  assert.equal(result, 0);
});

test('Given a claimed directory that does not exist in the tree, when main runs, then it returns 1 and reports the surface as unusable rather than throwing', () => {
  const sut = main;
  const { io, stdout } = captureIo();

  const result = withFixtureRoot({ readme: readmeClaiming(3) }, (root) => sut([root], io));

  assert.equal(result, 1);
  assert.match(stdout(), /corpus-counts: unusable input/);
});
