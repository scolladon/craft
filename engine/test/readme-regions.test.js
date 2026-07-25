import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractReadmeRegions } from '../src/readme-regions.js';

const ENABLED_PHASE_IDS = [
  'workspace',
  'design',
  'decisions',
  'planning',
  'implementation',
  'review',
  'refactoring',
  'validation',
  'documentation',
  'propose',
  'integrate',
];

const YAML_SNIPPET_BODY = [
  'pipeline:',
  '  skip: [refactoring]   # dependency-checked: a skip that strands a',
  '                        # downstream phase is refused, not silently applied',
].join('\n');

const MERMAID_BLOCK = [
  '```mermaid',
  'flowchart LR',
  '  W[workspace] --> spec',
  '  subgraph spec [specify]',
  '    D[design] --> DC{{"decisions 🧑"}} --> P[planning]',
  '  end',
  '  spec --> I[implementation] --> verify',
  '  subgraph verify [verify]',
  '    R[review] --> RF[refactoring] --> V[validation]',
  '  end',
  '  verify --> ship',
  '  subgraph ship [ship]',
  '    DO[documentation] --> PR[propose] --> IN{{"integrate 🧑"}}',
  '  end',
  '```',
].join('\n');

const TIMELINE_BLOCK = [
  '```text',
  '/craft:run "add rate limiting to the public API"',
  '',
  'workspace       → feature branch + isolated git worktree, deps installed',
  'design          → designer agent writes the design doc, self-reviews to convergence',
  'decisions   🧑  → you ratify each load-bearing choice; each becomes an ADR',
  'planning        → TDD plan split into parts, each with its own pre-chewed context block',
  'implementation  → one implementer agent per part; RED → GREEN → REFACTOR; one commit per part',
  'review          → parallel reviewers, one dimension each; fixes applied until convergence',
  'refactoring     → whole-codebase lens, behavior-preserving; may be an honest no-op',
  "validation      → your repo's engineering harness runs; findings fixed or proven benign",
  'documentation   → affected pages refreshed, backlog entry ticked',
  'propose         → pre-PR gate, push, PR created',
  'integrate   🧑  → CI to green; you confirm the merge; worktree torn down',
  '```',
].join('\n');

const FAQ_SENTENCE = [
  '**What does a run cost?** Across the [27 telemetered runs](docs/metrics-baseline.report.json)',
  'that built this repo: the median run logs ≈1.3 hours of role-agent activity, from',
  'half an hour for a small change to ≈5 hours for the largest feature …',
].join('\n');

const EXPECTED_COST_CLAIMS = { runCount: '27', median: '1.3', min: 'half an hour', max: '5' };

// ─── yamlBlocks: 0 / 1 / 2 fenced blocks ───────────────────────────────────

test('Given a fragment with no yaml fenced block, when extracted, then yamlBlocks is empty', () => {
  const sut = extractReadmeRegions;
  const readme = 'Just prose with no fenced blocks at all.\n';

  const result = sut(readme);

  assert.deepEqual(result.yamlBlocks, []);
});

test('Given a fragment with one yaml fenced block, when extracted, then yamlBlocks holds the between-fence body verbatim', () => {
  const sut = extractReadmeRegions;
  const readme = ['## Make it yours', '', '```yaml', YAML_SNIPPET_BODY, '```', '', 'More prose.'].join('\n');

  const result = sut(readme);

  assert.deepEqual(result.yamlBlocks, [YAML_SNIPPET_BODY]);
});

test('Given a fragment with two yaml fenced blocks, when extracted, then yamlBlocks holds both bodies verbatim in order', () => {
  const sut = extractReadmeRegions;
  const readme = ['```yaml', 'a: 1', '```', '', 'prose between blocks', '', '```yaml', 'b: 2', '```'].join('\n');

  const result = sut(readme);

  assert.deepEqual(result.yamlBlocks, ['a: 1', 'b: 2']);
});

// ─── mermaidPhases ──────────────────────────────────────────────────────────

test('Given the pinned mermaid block, when extracted, then mermaidPhases is the 11 enabled ids with subgraph labels excluded and 🧑 stripped', () => {
  const sut = extractReadmeRegions;

  const result = sut(MERMAID_BLOCK);

  assert.deepEqual(result.mermaidPhases, ENABLED_PHASE_IDS);
});

// ─── timelinePhases ─────────────────────────────────────────────────────────

test('Given the pinned timeline block, when extracted, then timelinePhases is the 11 enabled ids and the /craft:run line is skipped', () => {
  const sut = extractReadmeRegions;

  const result = sut(TIMELINE_BLOCK);

  assert.deepEqual(result.timelinePhases, ENABLED_PHASE_IDS);
});

// ─── costClaims ─────────────────────────────────────────────────────────────

test('Given the pinned FAQ sentence, when extracted, then costClaims holds the four anchored tokens', () => {
  const sut = extractReadmeRegions;

  const result = sut(FAQ_SENTENCE);

  assert.deepEqual(result.costClaims, EXPECTED_COST_CLAIMS);
});

// ─── anchor-not-offset proof ────────────────────────────────────────────────

test('Given all four regions surrounded by unrelated prose and blank lines, when extracted, then every region result is unchanged', () => {
  const sut = extractReadmeRegions;
  const readme = [
    'Random preamble paragraph, nothing structured here.',
    '',
    'More filler prose before the first region.',
    '',
    '```yaml',
    YAML_SNIPPET_BODY,
    '```',
    '',
    'Unrelated paragraph sitting between two regions.',
    '',
    'Yet more filler, several lines long, just noise.',
    '',
    MERMAID_BLOCK,
    '',
    'Filler again, this time before the timeline block.',
    '',
    TIMELINE_BLOCK,
    '',
    'Trailing filler paragraph, wrapping up with no structure.',
    '',
    FAQ_SENTENCE,
    '',
    'Final epilogue paragraph, just noise again.',
  ].join('\n');

  const result = sut(readme);

  assert.deepEqual(result.yamlBlocks, [YAML_SNIPPET_BODY]);
  assert.deepEqual(result.mermaidPhases, ENABLED_PHASE_IDS);
  assert.deepEqual(result.timelinePhases, ENABLED_PHASE_IDS);
  assert.deepEqual(result.costClaims, EXPECTED_COST_CLAIMS);
});
