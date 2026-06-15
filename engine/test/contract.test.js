import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { assembleContract } from '../src/contract.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(__dir, 'fixtures', 'contracts');

function readBundle(name) {
  return readFileSync(join(contractsDir, `${name}.md`), 'utf8');
}

const FRAGMENTS = {
  core:         readBundle('core'),
  producer:     readBundle('producer'),
  construction: readBundle('construction'),
  'harness-read':  readBundle('harness-read'),
  'harness-exec':  readBundle('harness-exec'),
  delivery:     readBundle('delivery'),
};

const RETRIEVAL_MARKER = 'retrieval';

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

// ─── U core always present ───────────────────────────────────────────────────

test('Given a descriptor with contract:[], when assembleContract runs, then U core content is present in output', () => {
  const descriptor = { id: 'workspace', contract: [], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(
    result.includes(FRAGMENTS.core.slice(0, 20)),
    'U core should always be present in the assembled block',
  );
});

test('Given a descriptor with contract:[producer], when assembleContract runs, then U core content is still present', () => {
  const descriptor = { id: 'design', contract: ['producer'], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(
    result.includes(FRAGMENTS.core.slice(0, 20)),
    'U core must be present regardless of named bundles',
  );
});

// ─── bundle ordering ──────────────────────────────────────────────────────────

test('Given contract:[producer, harness-read], when assembleContract runs, then both bundles appear after core in list order', () => {
  const descriptor = { id: 'review', contract: ['producer', 'harness-read'], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  // Anchor on the first core line (marker-free, survives carve-out expansion);
  // the last core line is a carve-out marker that expandCore rewrites.
  const corePos = result.indexOf(FRAGMENTS.core.split('\n')[0].trim());
  const producerStart = result.indexOf(FRAGMENTS.producer.slice(0, 20).trim());
  const harnessReadStart = result.indexOf(FRAGMENTS['harness-read'].slice(0, 20).trim());

  assert.ok(corePos !== -1 && corePos < producerStart, 'producer bundle must appear after core');
  assert.ok(producerStart < harnessReadStart, 'harness-read bundle must appear after producer');
});

test('Given contract:[harness-read, producer] (reversed), when assembleContract runs, then harness-read appears before producer in output', () => {
  const descriptor = { id: 'custom', contract: ['harness-read', 'producer'], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  const harnessReadStart = result.indexOf(FRAGMENTS['harness-read'].slice(0, 20).trim());
  const producerStart = result.indexOf(FRAGMENTS.producer.slice(0, 20).trim());

  assert.ok(harnessReadStart < producerStart, 'bundles must appear in list order from descriptor.contract');
});

// ─── derived retrieval note injected; not in bundle fixtures ─────────────────

test('Given any descriptor, when assembleContract runs, then output contains a retrieval note', () => {
  const descriptor = { id: 'workspace', contract: [], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(
    result.toLowerCase().includes(RETRIEVAL_MARKER),
    'assembleContract must inject a derived retrieval note',
  );
});

test('Given the fixture bundles, then no bundle fixture contains a retrieval string', () => {
  // The engine derives the retrieval note — it must not live in any bundle.
  for (const [name, content] of Object.entries(FRAGMENTS)) {
    assert.ok(
      !content.toLowerCase().includes(RETRIEVAL_MARKER),
      `Bundle "${name}" must not contain a retrieval string — the engine derives it`,
    );
  }
});

// ─── global + per-phase context appended verbatim ────────────────────────────

test('Given manifest with global context string, when assembleContract runs, then global context appears verbatim in output', () => {
  const descriptor = { id: 'design', contract: [], execution: 'agent' };
  const globalCtx = 'Global context content for the project.';
  const manifest = { context: globalCtx };
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(result.includes(globalCtx), 'Global context must appear verbatim in output');
});

test('Given manifest with per-phase context for this descriptor, when assembleContract runs, then per-phase context appears verbatim', () => {
  const descriptor = { id: 'design', contract: [], execution: 'agent' };
  const phaseCtx = 'Per-phase context specifically for design.';
  const manifest = {
    phases: {
      design: { context: phaseCtx },
    },
  };
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(result.includes(phaseCtx), 'Per-phase context must appear verbatim in output');
});

test('Given manifest with both global and per-phase context, when assembleContract runs, then global appears before per-phase', () => {
  const descriptor = { id: 'design', contract: [], execution: 'agent' };
  const globalCtx = 'Global context text.';
  const phaseCtx = 'Per-phase context text.';
  const manifest = {
    context: globalCtx,
    phases: { design: { context: phaseCtx } },
  };
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  const globalPos = result.indexOf(globalCtx);
  const phasePos = result.indexOf(phaseCtx);

  assert.ok(globalPos !== -1, 'Global context must be present');
  assert.ok(phasePos !== -1, 'Per-phase context must be present');
  assert.ok(globalPos < phasePos, 'Global context must appear before per-phase context');
});

// ─── inline carve-outs: exactly two lines change ─────────────────────────────

test('Given execution:agent vs execution:inline, when assembleContract runs, then exactly two lines differ', () => {
  const descriptor = { id: 'planning', contract: ['producer'], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const agentResult = sut(descriptor, manifest, FRAGMENTS, {});
  const inlineResult = sut({ ...descriptor, execution: 'inline' }, manifest, FRAGMENTS, { execution: 'inline' });

  const diffs = diffLines(agentResult, inlineResult);

  assert.equal(
    diffs.length,
    2,
    `Expected exactly 2 lines to differ between agent and inline modes, got ${diffs.length}: ${JSON.stringify(diffs)}`,
  );

  // The two changed lines must be the named carve-outs — nothing else.
  const inlineLines = diffs.map(d => d.b);
  const agentLines = diffs.map(d => d.a);
  assert.ok(
    inlineLines.some(l => l.includes('the commit is the handoff (no agent context to lose)')),
    'one changed line must be the inline artifact-handoff carve-out',
  );
  assert.ok(
    inlineLines.some(l => l.includes('the session model')),
    'one changed line must be the inline model carve-out',
  );
  assert.ok(
    agentLines.some(l => l.includes('the agent commit is the handoff')),
    'the agent-mode artifact-handoff line must be one of the two that changed',
  );
});

test('Given a contract bundle named after a prototype key, when assembleContract runs, then it throws Unknown contract bundle', () => {
  const descriptor = { id: 'workspace', contract: ['constructor'], execution: 'agent' };
  const sut = assembleContract;

  assert.throws(
    () => sut(descriptor, {}, FRAGMENTS, {}),
    /Unknown contract bundle/,
  );
});

test('Given execution:inline, when assembleContract runs, then artifact-handoff carve-out becomes "the commit is the handoff (no agent context to lose)"', () => {
  const descriptor = { id: 'planning', contract: [], execution: 'inline' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, { execution: 'inline' });

  assert.ok(
    result.includes('the commit is the handoff (no agent context to lose)'),
    'Inline carve-out must emit the commit-is-the-handoff variant',
  );
});

test('Given execution:inline, when assembleContract runs, then model carve-out becomes "the session model"', () => {
  const descriptor = { id: 'planning', contract: [], execution: 'inline' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, { execution: 'inline' });

  assert.ok(
    result.includes('the session model'),
    'Inline carve-out must emit "the session model" variant',
  );
});

test('Given execution:agent, when assembleContract runs, then agent-mode artifact-handoff line does not mention "the commit is the handoff (no agent context to lose)"', () => {
  const descriptor = { id: 'planning', contract: [], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(
    !result.includes('the commit is the handoff (no agent context to lose)'),
    'Agent mode must not emit the inline handoff carve-out',
  );
});

test('Given execution:agent, when assembleContract runs, then agent-mode model line does not say "the session model"', () => {
  const descriptor = { id: 'planning', contract: [], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(
    !result.includes('the session model'),
    'Agent mode must not emit the inline model carve-out',
  );
});

// ─── assembly order: core → bundles → retrieval → global ctx → per-phase ctx ─

test('Given a full descriptor with all sections, when assembleContract runs, then sections appear in canonical order', () => {
  const descriptor = { id: 'design', contract: ['producer'], execution: 'agent' };
  const globalCtx = 'Global context.';
  const phaseCtx = 'Phase context.';
  const manifest = {
    context: globalCtx,
    phases: { design: { context: phaseCtx } },
  };
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  const corePos     = result.indexOf(FRAGMENTS.core.slice(0, 20).trim());
  const producerPos = result.indexOf(FRAGMENTS.producer.slice(0, 20).trim());
  const retrievalPos = result.toLowerCase().indexOf(RETRIEVAL_MARKER);
  const globalPos   = result.indexOf(globalCtx);
  const phasePos    = result.indexOf(phaseCtx);

  assert.ok(corePos < producerPos,    'core must precede named bundles');
  assert.ok(producerPos < retrievalPos, 'bundles must precede retrieval note');
  assert.ok(retrievalPos < globalPos,   'retrieval note must precede global context');
  assert.ok(globalPos < phasePos,       'global context must precede per-phase context');
});
