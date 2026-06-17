import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { assembleContract } from '../src/contract.js';
import { parsePipeline } from '../src/descriptor.js';
import { CORE_MARKERS, hasCI } from '../test-helpers/contract-markers.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dir, '..', '..');
const contractsDir = join(repoRoot, 'contracts');

function readFragment(name) {
  return readFileSync(join(contractsDir, `${name}.md`), 'utf8');
}

const FRAGMENTS = {
  core:           readFragment('core'),
  producer:       readFragment('producer'),
  construction:   readFragment('construction'),
  'harness-read': readFragment('harness-read'),
  'harness-exec': readFragment('harness-exec'),
  delivery:       readFragment('delivery'),
  refinement:     readFragment('refinement'),
};

const DESCRIPTORS = parsePipeline(
  readFileSync(join(repoRoot, 'pipeline', 'default.yml'), 'utf8'),
);

// Markers specific to each bundle.
const PHASE_EXPECTATIONS = {
  producer:       ['template', 'Decision-candidates', 'convergence', 'mktemp'],
  construction:   ['RED→GREEN→REFACTOR', 'atomic commit', 'sut'],
  'harness-read': ['Read-only', 'findings', 'Zero findings'],
  'harness-exec': ['triages', 'Never weaken'],
  delivery:       ['traceable', 'listed targets', 'synthesis records'],
  refinement:     ['Behavior-preserving', 'mechanically', 'refactor('],
};

function linesOf(text) {
  return text.split('\n').filter(l => l.trim() !== '');
}

function diffLines(a, b) {
  const aLines = linesOf(a);
  const bLines = linesOf(b);
  const maxLen = Math.max(aLines.length, bLines.length);
  const diffs = [];
  for (let i = 0; i < maxLen; i++) {
    if (aLines[i] !== bLines[i]) {
      diffs.push({ index: i, a: aLines[i], b: bLines[i] });
    }
  }
  return diffs;
}

// ─── per-descriptor marker checks ────────────────────────────────────────────

for (const descriptor of DESCRIPTORS) {
  test(`Given descriptor "${descriptor.id}", when assembled in agent mode, then core markers are all present`, () => {
    const sut = assembleContract;

    const result = sut(descriptor, {}, FRAGMENTS, { execution: 'agent' });

    for (const marker of CORE_MARKERS) {
      assert.ok(
        hasCI(result, marker),
        `Descriptor "${descriptor.id}": core marker "${marker}" missing from assembled block`,
      );
    }
  });

  for (const bundleName of descriptor.contract) {
    test(`Given descriptor "${descriptor.id}" with bundle "${bundleName}", when assembled in agent mode, then bundle markers are all present`, () => {
      const expectations = PHASE_EXPECTATIONS[bundleName];
      assert.ok(
        expectations,
        `No marker expectations defined for bundle "${bundleName}" — add them to PHASE_EXPECTATIONS`,
      );

      const sut = assembleContract;

      const result = sut(descriptor, {}, FRAGMENTS, { execution: 'agent' });

      for (const marker of expectations) {
        assert.ok(
          hasCI(result, marker),
          `Descriptor "${descriptor.id}" bundle "${bundleName}": marker "${marker}" missing`,
        );
      }
    });
  }

  // Inline diff: exactly two lines change (the carve-outs)
  test(`Given descriptor "${descriptor.id}", when assembled agent vs inline, then exactly two lines differ`, () => {
    const sut = assembleContract;

    const agentBlock = sut(descriptor, {}, FRAGMENTS, { execution: 'agent' });
    const inlineBlock = sut(descriptor, {}, FRAGMENTS, { execution: 'inline' });

    const diffs = diffLines(agentBlock, inlineBlock);

    assert.equal(
      diffs.length,
      2,
      `Descriptor "${descriptor.id}": expected exactly 2 lines to differ between agent and inline, got ${diffs.length}: ${JSON.stringify(diffs)}`,
    );

    const inlineLines = diffs.map(d => d.b);
    const agentLines = diffs.map(d => d.a);

    assert.ok(
      inlineLines.some(l => l.includes('the commit is the handoff (no agent context to lose)')),
      `Descriptor "${descriptor.id}": inline artifact-handoff carve-out line missing`,
    );
    assert.ok(
      inlineLines.some(l => l.includes('the session model')),
      `Descriptor "${descriptor.id}": inline model carve-out line missing`,
    );
    assert.ok(
      agentLines.some(l => l.includes('the agent commit is the handoff')),
      `Descriptor "${descriptor.id}": agent artifact-handoff line must be one of the two that changed`,
    );
    assert.ok(
      agentLines.some(l => l.includes('the role model resolved')),
      `Descriptor "${descriptor.id}": agent model line must be one of the two that changed`,
    );
  });
}
