import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'readme-drift.js');

// ─── fixture building blocks (mirrors readme-drift-main.test.js) ────────────────

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

const CLEAN_YAML_BLOCK = ['```yaml', 'pipeline:', '  skip: [gamma]', '```'].join('\n');

const FAQ_SECTION = [
  '**What does a run cost?** Across the 3 telemetered runs that built this repo: the median',
  'run logs ≈1.5 hours of role-agent activity, from half an hour for a small change to ≈4 hours',
  'for the largest feature.',
].join('\n');

const CLEAN_README = ['# fixture', '', MERMAID_BLOCK, '', TIMELINE_BLOCK, '', CLEAN_YAML_BLOCK, '', FAQ_SECTION, ''].join('\n');

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

const CLEAN_REPORT = JSON.stringify({
  schemaVersion: 1,
  recommendations: [],
  runs: [
    { run: 1, slug: 'a', reviewCycles: 1, groups: [{ durationMs: 1_800_000 }] },
    { run: 2, slug: 'b', reviewCycles: 1, groups: [{ durationMs: 5_400_000 }] },
    { run: 3, slug: 'c', reviewCycles: 1, groups: [{ durationMs: 14_400_000 }] },
  ],
});

// ─── test helpers ──────────────────────────────────────────────────────────────

function withFixtureRoot(overrides, run) {
  const root = mkdtempSync(join(tmpdir(), 'readme-drift-bin-'));
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

function run(root) {
  return spawnSync(process.execPath, [BIN, root], { encoding: 'utf8' });
}

// ─── cases ──────────────────────────────────────────────────────────────────────

test('Given a clean fixture tree, when the readme-drift bin is spawned with the root arg, then it exits 0', () => {
  const sut = run;

  const result = withFixtureRoot({}, sut);

  assert.equal(result.status, 0, `stdout: ${result.stdout} stderr: ${result.stderr}`);
});

test('Given a tree with a renamed phase, when the readme-drift bin is spawned with the root arg, then it exits non-zero and names the surface', () => {
  const sut = run;

  const result = withFixtureRoot({ defaultYml: RENAMED_PHASE_YML }, sut);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /phase-names/);
});
