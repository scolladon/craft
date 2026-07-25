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

// ─── fence-line anchoring (FENCE_LINE regex) ───────────────────────────────

test('Given a yaml block body line that ends with a bare triple-backtick sequence mid-line, when extracted, then that line stays inside the block (fence detection is anchored to line-start)', () => {
  const sut = extractReadmeRegions;
  const readme = ['```yaml', 'a: 1', 'b: 2 // see appendix below ```', 'c: 3', '```'].join('\n');

  const result = sut(readme);

  assert.deepEqual(result.yamlBlocks, ['a: 1\nb: 2 // see appendix below ```\nc: 3']);
});

test('Given a fence line carrying trailing prose after the info string, when extracted, then it is not treated as a fence (fence lines must be bare)', () => {
  const sut = extractReadmeRegions;
  const readme = ['```yaml trailing note', 'a: 1', '```', '', '```yaml', 'b: 2', '```'].join('\n');

  const result = sut(readme);

  assert.deepEqual(result.yamlBlocks, ['b: 2']);
});

test('Given a yaml fence line carrying a trailing carriage return, when extracted, then the fence still opens and closes the block (trailing-whitespace tolerance)', () => {
  const sut = extractReadmeRegions;
  const readme = ['```yaml\r', 'a: 1', '```\r'].join('\n');

  const result = sut(readme);

  assert.deepEqual(result.yamlBlocks, ['a: 1']);
});

test('Given a yaml block whose body contains a line that itself reads as another yaml opening fence, when extracted, then the block does not reset — the whole span between the true fences is kept', () => {
  const sut = extractReadmeRegions;
  const readme = ['```yaml', 'first: 1', '```yaml', 'second: 2', '```'].join('\n');

  const result = sut(readme);

  assert.deepEqual(result.yamlBlocks, ['first: 1\n```yaml\nsecond: 2']);
});

test('Given a yaml block whose body contains a fence line with a different non-empty info string, when extracted, then that line does not close the block — only a bare closing fence does', () => {
  const sut = extractReadmeRegions;
  const readme = ['```yaml', 'first: 1', '```mermaid', 'second: 2', '```'].join('\n');

  const result = sut(readme);

  assert.deepEqual(result.yamlBlocks, ['first: 1\n```mermaid\nsecond: 2']);
});

// ─── mermaidPhases ──────────────────────────────────────────────────────────

test('Given the pinned mermaid block, when extracted, then mermaidPhases is the 11 enabled ids with subgraph labels excluded and 🧑 stripped', () => {
  const sut = extractReadmeRegions;

  const result = sut(MERMAID_BLOCK);

  assert.deepEqual(result.mermaidPhases, ENABLED_PHASE_IDS);
});

test('Given a fragment with no mermaid fenced block, when extracted, then mermaidPhases is empty', () => {
  const sut = extractReadmeRegions;
  const readme = 'Just prose, no mermaid block here.\n';

  const result = sut(readme);

  assert.deepEqual(result.mermaidPhases, []);
});

test('Given a subgraph line that also carries a hexagon-style label, when extracted, then the bracket group label is dropped but the hexagon label is kept', () => {
  const sut = extractReadmeRegions;
  const block = ['```mermaid', 'flowchart LR', '  subgraph spec [specify] --- X{{"extra"}}', '```'].join('\n');

  const result = sut(block);

  assert.deepEqual(result.mermaidPhases, ['extra']);
});

test('Given a hexagon label whose 🧑 marker is followed by trailing whitespace before the closing quote, when extracted, then the marker is still stripped', () => {
  const sut = extractReadmeRegions;
  const block = ['```mermaid', 'flowchart LR', '  DC{{"decisions 🧑  "}}', '```'].join('\n');

  const result = sut(block);

  assert.deepEqual(result.mermaidPhases, ['decisions']);
});

test('Given a hexagon label whose 🧑 marker sits before trailing text (not at the true end), when extracted, then the marker is left untouched (TRAILING_PERSON_TAG only strips a trailing tag)', () => {
  const sut = extractReadmeRegions;
  const block = ['```mermaid', 'flowchart LR', '  DC{{"decisions 🧑 marker"}}', '```'].join('\n');

  const result = sut(block);

  assert.deepEqual(result.mermaidPhases, ['decisions 🧑 marker']);
});

// ─── timelinePhases ─────────────────────────────────────────────────────────

test('Given the pinned timeline block, when extracted, then timelinePhases is the 11 enabled ids and the /craft:run line is skipped', () => {
  const sut = extractReadmeRegions;

  const result = sut(TIMELINE_BLOCK);

  assert.deepEqual(result.timelinePhases, ENABLED_PHASE_IDS);
});

test('Given a fragment with no text fenced block, when extracted, then timelinePhases is empty', () => {
  const sut = extractReadmeRegions;
  const readme = 'Just prose, no text block here.\n';

  const result = sut(readme);

  assert.deepEqual(result.timelinePhases, []);
});

// ─── costClaims ─────────────────────────────────────────────────────────────

test('Given the pinned FAQ sentence, when extracted, then costClaims holds the four anchored tokens', () => {
  const sut = extractReadmeRegions;

  const result = sut(FAQ_SENTENCE);

  assert.deepEqual(result.costClaims, EXPECTED_COST_CLAIMS);
});

test('Given an FAQ sentence whose median is a whole number of hours, when extracted, then median and max stay distinct claims', () => {
  const sut = extractReadmeRegions;
  const integerMedianFaq = [
    '**What does a run cost?** Across the [27 telemetered runs](docs/metrics-baseline.report.json)',
    'that built this repo: the median run logs ≈2 hours of role-agent activity, from',
    'half an hour for a small change to ≈5 hours for the largest feature …',
  ].join('\n');

  const result = sut(integerMedianFaq);

  assert.equal(result.costClaims.median, '2');
  assert.equal(result.costClaims.max, '5');
});

test('Given decoy numbers before the FAQ anchor, when extracted, then costClaims resolve to the post-anchor tokens only', () => {
  const sut = extractReadmeRegions;
  const readme = [
    'Earlier prose bragging about 99 telemetered runs somewhere else entirely,',
    'a stray ≈9 hours estimate, and even a bogus range to ≈9 hours for effect.',
    '',
    FAQ_SENTENCE,
  ].join('\n');

  const result = sut(readme);

  assert.deepEqual(result.costClaims, EXPECTED_COST_CLAIMS);
});

test('Given a timeline line whose phase id carries an attached 🧑 marker, when extracted, then the marker is stripped from the token', () => {
  const sut = extractReadmeRegions;
  const block = ['```text', 'decisions🧑 → you ratify the choices', '```'].join('\n');

  const result = sut(block);

  assert.deepEqual(result.timelinePhases, ['decisions']);
});

test('Given a max claim written as a two-digit number, when extracted, then costClaims.max captures the full number', () => {
  const sut = extractReadmeRegions;
  const readme = [
    '**What does a run cost?** Across the 27 telemetered runs that built this repo: the median',
    'run logs ≈1.3 hours of role-agent activity, from half an hour for a small change to ≈12 hours',
    'for the largest feature.',
  ].join('\n');

  const result = sut(readme);

  assert.equal(result.costClaims.max, '12');
});

test('Given the FAQ anchor starting at index 1 of the readme (not index -1 or +1 specifically), when extracted, then costClaims still resolve — the absent check is "not found", not "found at a fixed offset"', () => {
  const sut = extractReadmeRegions;
  const readme = [
    'X',
    'What does a run cost? Across the 27 telemetered runs that built this repo: the median',
    'run logs ≈1.3 hours of role-agent activity, from half an hour for a small change to ≈5 hours',
    'for the largest feature.',
  ].join('');

  const result = sut(readme);

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
