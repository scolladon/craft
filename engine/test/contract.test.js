import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { assembleContract, ARCHETYPE_TURN_BUDGET } from '../src/contract.js';
import { VALID_ARCHETYPES } from '../src/descriptor.js';

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
  refinement:   readBundle('refinement'),
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

// ─── phases.<id>.tools declarative line ──────────────────────────────────────

test('Given a manifest declaring phase tools, when assembleContract runs, then the block ends with the declarative tools line naming each declared tool', () => {
  const descriptor = { id: 'design', contract: [], execution: 'agent' };
  const manifest = { phases: { design: { tools: ['Read', 'Grep', 'Bash'] } } };
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  const lines = result.split('\n');
  assert.equal(
    lines[lines.length - 1],
    "Tools declared for this phase: Read, Grep, Bash — declarative; the agent definition's allowlist is what binds at spawn.",
  );
});

test('Given a manifest declaring phase tools as a bare string, when assembleContract runs, then the tools line renders it as a one-element list', () => {
  const descriptor = { id: 'design', contract: [], execution: 'agent' };
  const manifest = { phases: { design: { tools: 'Read' } } };
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(
    result.endsWith("Tools declared for this phase: Read — declarative; the agent definition's allowlist is what binds at spawn."),
  );
});

test('Given a manifest declaring phase tools, when assembleContract runs in agent vs inline mode, then the tools line text is identical', () => {
  const descriptor = { id: 'design', contract: [], execution: 'agent' };
  const manifest = { phases: { design: { tools: ['Read', 'Bash'] } } };
  const sut = assembleContract;

  const agentResult = sut(descriptor, manifest, FRAGMENTS, {});
  const inlineResult = sut({ ...descriptor, execution: 'inline' }, manifest, FRAGMENTS, { execution: 'inline' });

  const toolsLine = "Tools declared for this phase: Read, Bash — declarative; the agent definition's allowlist is what binds at spawn.";
  assert.ok(agentResult.endsWith(toolsLine), 'agent-mode block must end with the tools line');
  assert.ok(inlineResult.endsWith(toolsLine), 'inline-mode block must end with the same tools line');
});

test('Given a manifest with no tools declared for the phase, when assembleContract runs, then no tools line appears', () => {
  const descriptor = { id: 'design', contract: [], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(!result.includes('Tools declared for this phase'));
});

test('Given a manifest declaring tools for a different phase, when assembleContract runs, then no tools line appears for this descriptor', () => {
  const descriptor = { id: 'design', contract: [], execution: 'agent' };
  const manifest = { phases: { review: { tools: ['Read'] } } };
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  assert.ok(!result.includes('Tools declared for this phase'));
});

// ─── refinement bundle ────────────────────────────────────────────────────────

test('Given a descriptor with contract:[refinement], when assembleContract runs, then refinement fixture content is present in output', () => {
  const descriptor = { id: 'refactoring', contract: ['refinement'], execution: 'agent' };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, FRAGMENTS, {});

  const corePos = result.indexOf(FRAGMENTS.core.split('\n')[0].trim());
  const refinementPos = result.indexOf(FRAGMENTS.refinement);
  assert.ok(
    result.includes(FRAGMENTS.refinement),
    'refinement bundle content must appear verbatim in output',
  );
  assert.ok(
    corePos !== -1 && corePos < refinementPos,
    'refinement bundle must appear after the U core',
  );
});

// ─── output-digest core line ─────────────────────────────────────────────────

test('Given the real core fragment, when assembleContract runs in agent and inline mode, then the output-digest line is present and identical in both', () => {
  const realCore = readFileSync(join(__dir, '..', '..', 'contracts', 'core.md'), 'utf8');
  const fragments = { ...FRAGMENTS, core: realCore };
  const descriptor = { id: 'workspace', contract: [], execution: 'agent' };
  const sut = assembleContract;

  const agentResult = sut(descriptor, {}, fragments, { execution: 'agent' });
  const inlineResult = sut(descriptor, {}, fragments, { execution: 'inline' });

  const OUTPUT_DIGEST_PREFIX = 'Output digest:';
  const agentLine = agentResult.split('\n').find(line => line.startsWith(OUTPUT_DIGEST_PREFIX));
  const inlineLine = inlineResult.split('\n').find(line => line.startsWith(OUTPUT_DIGEST_PREFIX));

  assert.ok(agentLine, 'agent-mode block must contain the output-digest line');
  assert.ok(inlineLine, 'inline-mode block must contain the output-digest line');
  assert.equal(agentLine, inlineLine, 'the output-digest line must render identically in both execution modes');
});

// ─── turn-budget core line ────────────────────────────────────────────────────

const REAL_CORE = readFileSync(join(__dir, '..', '..', 'contracts', 'core.md'), 'utf8');
const REAL_CORE_FRAGMENTS = { ...FRAGMENTS, core: REAL_CORE };
const TURN_BUDGET_PREFIX = 'Turn budget:';

function turnBudgetLine(text) {
  return text.split('\n').find(line => line.startsWith(TURN_BUDGET_PREFIX));
}

test('Given a descriptor carrying turn_budget:150 and an empty manifest, when assembleContract runs, then the block carries the budgeted turn-budget text naming 150 tool calls', () => {
  const descriptor = { id: 'implementation', archetype: 'construction', contract: [], execution: 'agent', turn_budget: 150 };
  const manifest = {};
  const sut = assembleContract;

  const result = sut(descriptor, manifest, REAL_CORE_FRAGMENTS, { execution: 'agent' });

  assert.equal(
    turnBudgetLine(result),
    'Turn budget: ~150 tool calls for this phase. On reaching it, commit what is green, write a handback (done / remains / next RED), and return — never continue past it. The unit of work resumes from the artifact with a fresh context.',
  );
});

test('Given the turn-budget resolution chain, when manifest, descriptor and archetype each may supply a value, then manifest wins over descriptor, descriptor wins over the archetype table, and an unresolvable archetype degrades to run-to-completion without throwing', () => {
  const sut = assembleContract;

  const manifestWins = sut(
    { id: 'implementation', archetype: 'construction', contract: [], execution: 'agent', turn_budget: 150 },
    { phases: { implementation: { turn_budget: 40 } } },
    REAL_CORE_FRAGMENTS,
    { execution: 'agent' },
  );
  assert.ok(
    turnBudgetLine(manifestWins).startsWith('Turn budget: ~40 tool calls'),
    `manifest turn_budget must win over descriptor turn_budget; got: ${turnBudgetLine(manifestWins)}`,
  );

  const archetypeWins = sut(
    { id: 'design', archetype: 'specification', contract: [], execution: 'agent' },
    {},
    REAL_CORE_FRAGMENTS,
    { execution: 'agent' },
  );
  assert.ok(
    turnBudgetLine(archetypeWins).startsWith('Turn budget: ~100 tool calls'),
    `archetype table value must be used when neither manifest nor descriptor declares a budget; got: ${turnBudgetLine(archetypeWins)}`,
  );

  const unknownArchetype = () => sut(
    { id: 'ghost', archetype: 'ghost-archetype', contract: [], execution: 'agent' },
    {},
    REAL_CORE_FRAGMENTS,
    { execution: 'agent' },
  );
  assert.doesNotThrow(unknownArchetype, 'an unknown archetype with no contract array must not throw');
  assert.equal(
    turnBudgetLine(unknownArchetype()),
    'Turn budget: none declared for this phase — run to completion.',
  );

  // Defensive guard: a descriptor with no `contract` array at all (bypassing
  // descriptor.js's normalization, e.g. raw --descriptor-json input) must fail
  // with the bundle loop's own "not iterable" message — never a worse, earlier
  // message from isExecutingHarness reading .includes on a non-array.
  assert.throws(
    () => sut({ id: 'ghost2', archetype: 'construction' }, {}, REAL_CORE_FRAGMENTS, { execution: 'agent' }),
    /descriptor\.contract is not iterable/,
    'turn-budget resolution must not throw a different, earlier error than the bundle loop for a missing contract array',
  );
});

test('Given one descriptor, when assembled in agent mode and inline mode, then the turn-budget line is byte-identical in both', () => {
  const descriptor = { id: 'implementation', archetype: 'construction', contract: [], execution: 'agent', turn_budget: 150 };
  const manifest = {};
  const sut = assembleContract;

  const agentResult = sut(descriptor, manifest, REAL_CORE_FRAGMENTS, { execution: 'agent' });
  const inlineResult = sut({ ...descriptor, execution: 'inline' }, manifest, REAL_CORE_FRAGMENTS, { execution: 'inline' });

  assert.ok(turnBudgetLine(agentResult), 'agent-mode block must contain the turn-budget line');
  assert.ok(turnBudgetLine(inlineResult), 'inline-mode block must contain the turn-budget line');
  assert.equal(
    turnBudgetLine(agentResult),
    turnBudgetLine(inlineResult),
    'the turn-budget line must render identically in both execution modes — it resolves on the descriptor axis, not the execution-mode axis',
  );
});

test('Given ARCHETYPE_TURN_BUDGET, when its key set is compared to VALID_ARCHETYPES, then every archetype is covered, including the explicit setup/none entry', () => {
  const sut = ARCHETYPE_TURN_BUDGET;

  for (const archetype of VALID_ARCHETYPES) {
    assert.ok(
      Object.hasOwn(sut, archetype),
      `ARCHETYPE_TURN_BUDGET is missing an entry for archetype "${archetype}"`,
    );
  }
  assert.equal(sut.setup, null, 'setup spawns no agent — its turn budget must degrade to null');
});
