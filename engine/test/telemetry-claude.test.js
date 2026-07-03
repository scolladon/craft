import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import {
  tokensFromClaudeUsage,
  eventFromRollup,
  parseLines,
} from '../src/observability/adapters/claude/telemetry.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/telemetry');

function fixtureLines(name) {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8').split('\n');
}

async function* asyncLines(lines) {
  for (const line of lines) yield line;
}

// ── 1. tokensFromClaudeUsage — maps raw field names ───────────────────────────

test('Given a raw Claude usage object, when tokensFromClaudeUsage runs, then it maps snake_case fields to neutral camelCase names', () => {
  const usage = {
    input_tokens: 100,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 50,
    output_tokens: 30,
  };
  const sut = tokensFromClaudeUsage;

  const result = sut(usage);

  assert.deepEqual(result.tokens, { input: 100, cacheRead: 200, cacheCreation: 50, output: 30 });
});

// ── 2. tokensFromClaudeUsage — cacheCreationTtl present ───────────────────────

test('Given a usage object with cache_creation TTL split, when tokensFromClaudeUsage runs, then cacheCreationTtl has creation5m and creation1h', () => {
  const usage = {
    input_tokens: 2,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 255,
    output_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 55 },
  };
  const sut = tokensFromClaudeUsage;

  const result = sut(usage);

  assert.deepEqual(result.cacheCreationTtl, { creation5m: 200, creation1h: 55 });
});

// ── 3. tokensFromClaudeUsage — cacheCreationTtl absent ────────────────────────

test('Given a usage object without cache_creation, when tokensFromClaudeUsage runs, then cacheCreationTtl is null', () => {
  const usage = {
    input_tokens: 5,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 3,
  };
  const sut = tokensFromClaudeUsage;

  const result = sut(usage);

  assert.equal(result.cacheCreationTtl, null);
});

// ── 4. eventFromRollup — normalizes [1m] suffix ───────────────────────────────

test('Given a rollup with resolvedModel ending in [1m], when eventFromRollup runs, then model is normalized to the base id without the suffix', () => {
  const rollup = {
    agentType: 'craft:designer',
    resolvedModel: 'claude-opus-4-8[1m]',
    totalDurationMs: 1000,
    totalToolUseCount: 2,
    usage: {
      input_tokens: 1,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 1,
    },
  };
  const sut = eventFromRollup;

  const result = sut(rollup, { sessionId: 'sess-1', slug: 'feat' });

  assert.equal(result.model, 'claude-opus-4-8');
});

// ── 5. eventFromRollup — accepts Task spawn shape (subagent_type, ADR-188) ────

test('Given a rollup with subagent_type instead of agentType, when eventFromRollup runs, then the event derives phase and role from that field', () => {
  const rollup = {
    subagent_type: 'craft:planner',
    resolvedModel: 'claude-sonnet-4-6',
    totalDurationMs: 5000,
    totalToolUseCount: 3,
    usage: {
      input_tokens: 10,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 5,
    },
  };
  const sut = eventFromRollup;

  const result = sut(rollup, { sessionId: 'sess-2', slug: 'feat' });

  assert.equal(result.phase, 'planning');
  assert.equal(result.role, 'planner');
});

// ── 6. eventFromRollup — full proof: designer 589907ms exact tokens ───────────

test('Given a craft:designer rollup with the empirically-pinned proof values, when eventFromRollup runs, then phase design, exact durationMs, tokens, and cacheCreationTtl match', () => {
  const rollup = {
    agentType: 'craft:designer',
    resolvedModel: 'claude-opus-4-8',
    totalDurationMs: 589907,
    totalTokens: 197219,
    totalToolUseCount: 10,
    usage: {
      input_tokens: 2,
      cache_read_input_tokens: 196062,
      cache_creation_input_tokens: 255,
      output_tokens: 900,
      cache_creation: { ephemeral_5m_input_tokens: 255, ephemeral_1h_input_tokens: 0 },
    },
  };
  const sut = eventFromRollup;

  const result = sut(rollup, { sessionId: 'sess-proof', slug: 'feature-x' });

  assert.equal(result.phase, 'design');
  assert.equal(result.role, 'designer');
  assert.equal(result.model, 'claude-opus-4-8');
  assert.equal(result.durationMs, 589907);
  assert.deepEqual(result.tokens, { input: 2, cacheRead: 196062, cacheCreation: 255, output: 900 });
  assert.deepEqual(result.cacheCreationTtl, { creation5m: 255, creation1h: 0 });
});

// ── 7. eventFromRollup — unknown agentType yields null phase ─────────────────

test('Given a rollup with an unrecognized agentType, when eventFromRollup runs, then phase is null', () => {
  const rollup = {
    agentType: 'unknown-agent',
    resolvedModel: 'claude-opus-4-8',
    totalDurationMs: 1000,
    totalToolUseCount: 1,
    usage: {
      input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
    },
  };
  const sut = eventFromRollup;

  const result = sut(rollup, { sessionId: 'sess-3', slug: 'feat' });

  assert.equal(result.phase, null);
});

// ── 8. eventFromRollup — synthetic resolvedModel returns null ─────────────────

test('Given a rollup with resolvedModel of <synthetic>, when eventFromRollup runs, then it returns null', () => {
  const rollup = {
    agentType: 'craft:designer',
    resolvedModel: '<synthetic>',
    totalDurationMs: 0,
    totalToolUseCount: 0,
    usage: {
      input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
    },
  };
  const sut = eventFromRollup;

  const result = sut(rollup, { sessionId: 'sess-4', slug: 'feat' });

  assert.equal(result, null);
});

// ── 9. parseLines — emits UsageEvent from single-rollup fixture ───────────────

test('Given a fixture with one valid agent rollup, when parseLines runs, then one UsageEvent is returned with correct phase and model and skipped is 0', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-rollup.jsonl')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].phase, 'design');
  assert.equal(result.events[0].model, 'claude-opus-4-8');
  assert.equal(result.events[0].durationMs, 589907);
});

// ── 10. parseLines — filters synthetic-model rollup ──────────────────────────

test('Given a fixture whose only rollup has resolvedModel of <synthetic>, when parseLines runs, then events is empty and skipped is 0', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('with-synthetic.jsonl')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 0);
});

// ── 11. parseLines — skips malformed lines and counts them ───────────────────

test('Given a fixture with two valid rollups and one malformed line as the third, when parseLines runs, then two events are emitted and skipped is 1', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('malformed.jsonl')));

  assert.equal(result.skipped, 1);
  assert.equal(result.events.length, 2);
});

// ── 12. parseLines — token sums from 50_000-token fixture rollup ─────────────

test('Given the first rollup in the malformed fixture with totalTokens of 50000, when parseLines runs, then the emitted event token classes sum to 50000', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('malformed.jsonl')));

  const firstEvent = result.events[0];
  const tokenSum = firstEvent.tokens.input + firstEvent.tokens.cacheRead
    + firstEvent.tokens.cacheCreation + firstEvent.tokens.output;
  assert.equal(tokenSum, 50000);
});

// ── 13. tokensFromClaudeUsage — adversarial non-numeric values coerce to 0 (F6) ──

test('Given a usage object with non-numeric token values (string, null, NaN), when tokensFromClaudeUsage runs, then all token fields coerce to 0', () => {
  const usage = {
    input_tokens: 'bad-string',
    cache_read_input_tokens: null,
    cache_creation_input_tokens: undefined,
    output_tokens: NaN,
  };
  const sut = tokensFromClaudeUsage;

  const result = sut(usage);

  assert.equal(result.tokens.input, 0, 'string must coerce to 0');
  assert.equal(result.tokens.cacheRead, 0, 'null must coerce to 0');
  assert.equal(result.tokens.cacheCreation, 0, 'undefined must coerce to 0');
  assert.equal(result.tokens.output, 0, 'NaN must coerce to 0');
});

// ── 14. parseLines — --since filters events before the cutoff (D) ────────────

const BEFORE_CUTOFF_LINE = JSON.stringify({
  type: 'user',
  sessionId: 'sess-before',
  slug: 'feat',
  timestamp: '2026-01-01T00:00:00.000Z',
  toolUseResult: {
    agentType: 'craft:designer',
    resolvedModel: 'claude-sonnet-4-6',
    totalDurationMs: 100,
    totalToolUseCount: 1,
    usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
  },
});

const AFTER_CUTOFF_LINE = JSON.stringify({
  type: 'user',
  sessionId: 'sess-after',
  slug: 'feat',
  timestamp: '2026-06-01T00:00:00.000Z',
  toolUseResult: {
    agentType: 'craft:planner',
    resolvedModel: 'claude-sonnet-4-6',
    totalDurationMs: 200,
    totalToolUseCount: 2,
    usage: { input_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 2 },
  },
});

async function* twoLines() {
  yield BEFORE_CUTOFF_LINE;
  yield AFTER_CUTOFF_LINE;
}

test('Given two events one before and one after the cutoff, when parseLines runs with since cutoff, then only the later event survives', async () => {
  const since = '2026-03-01T00:00:00.000Z';
  const sut = parseLines;

  const result = await sut(twoLines(), since);

  assert.equal(result.events.length, 1, 'only the after-cutoff event must survive');
  assert.equal(result.events[0].run, 'sess-after');
  assert.equal(result.skipped, 0, 'filtered-by-since events are not skipped');
});

// ── 15. phaseFromAgentType — all eight ROLE_TO_PHASE values are correct ───────

test('Given each recognized craft agentType, when eventFromRollup runs, then phase maps to the correct vendor-neutral label', () => {
  const ROLE_PHASE_MAP = {
    'craft:part-implementer': 'implementation',
    'craft:reviewer': 'review',
    'craft:harness-triager': 'validation',
    'craft:validation-triager': 'validation',
    'craft:docs-writer': 'documentation',
    'craft:backlog-ticker': 'documentation',
    'craft:requirements-writer': 'requirements',
    'craft:refactor-executor': 'refactoring',
  };
  const baseUsage = {
    input_tokens: 1, cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0, output_tokens: 1,
  };
  const sut = eventFromRollup;

  for (const [agentType, expectedPhase] of Object.entries(ROLE_PHASE_MAP)) {
    const rollup = {
      agentType,
      resolvedModel: 'claude-sonnet-4-6',
      totalDurationMs: 100,
      totalToolUseCount: 1,
      usage: baseUsage,
    };
    const result = sut(rollup, { sessionId: 's1', slug: null });
    assert.equal(result.phase, expectedPhase, `${agentType} must map to phase ${expectedPhase}`);
  }
});

// ── 16. normalizeModel — non-string model passes through unchanged ─────────────

test('Given a rollup with a non-string resolvedModel (null), when eventFromRollup runs, then the event model is null', () => {
  const rollup = {
    agentType: 'craft:designer',
    resolvedModel: null,
    totalDurationMs: 0,
    totalToolUseCount: 0,
    usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
  };
  const sut = eventFromRollup;

  const result = sut(rollup, { sessionId: 's1', slug: null });

  assert.equal(result.model, null, 'non-string model must pass through as-is');
});

// ── 17. roleFromAgentType — falsy agentType yields null role ──────────────────

test('Given a rollup with an empty string agentType (falsy), when eventFromRollup runs, then role and phase are null', () => {
  const rollup = {
    agentType: '',
    resolvedModel: 'claude-sonnet-4-6',
    totalDurationMs: 0,
    totalToolUseCount: 0,
    usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
  };
  const sut = eventFromRollup;

  const result = sut(rollup, { sessionId: 's1', slug: null });

  assert.equal(result.role, null, 'empty agentType must yield null role');
  assert.equal(result.phase, null, 'empty agentType must yield null phase');
});

// ── 18. tokensFromClaudeUsage — non-object cache_creation yields cacheCreationTtl=null ──

test('Given a usage object with cache_creation as a number (non-object), when tokensFromClaudeUsage runs, then cacheCreationTtl is null', () => {
  const usage = {
    input_tokens: 10,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 100,
    output_tokens: 5,
    cache_creation: 42,
  };
  const sut = tokensFromClaudeUsage;

  const result = sut(usage);

  assert.equal(result.cacheCreationTtl, null, 'numeric cache_creation must not produce a TTL split');
});

// ── 19. eventFromRollup — slug is propagated to the event ─────────────────────

test('Given a rollup with context slug, when eventFromRollup runs, then the event slug matches the context slug', () => {
  const rollup = {
    agentType: 'craft:designer',
    resolvedModel: 'claude-sonnet-4-6',
    totalDurationMs: 500,
    totalToolUseCount: 3,
    usage: { input_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 2 },
  };
  const sut = eventFromRollup;

  const result = sut(rollup, { sessionId: 'sess-x', slug: 'my-feature' });

  assert.equal(result.slug, 'my-feature', 'event slug must equal context slug');
});

// ── 20. eventFromRollup — messages equals totalToolUseCount ───────────────────

test('Given a rollup with totalToolUseCount of 7, when eventFromRollup runs, then the event messages field is 7', () => {
  const rollup = {
    agentType: 'craft:planner',
    resolvedModel: 'claude-sonnet-4-6',
    totalDurationMs: 1000,
    totalToolUseCount: 7,
    usage: { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 5 },
  };
  const sut = eventFromRollup;

  const result = sut(rollup, { sessionId: 'sess-y', slug: null });

  assert.equal(result.messages, 7, 'messages must equal totalToolUseCount');
});

// ── 21. parseLines — toolUseResult with no identifying fields is ignored ──────

test('Given a JSONL line with toolUseResult that has no agentType/subagent_type/resolvedModel, when parseLines runs, then no event is emitted', async () => {
  const noIdentifierLine = JSON.stringify({
    type: 'user',
    sessionId: 'sess-z',
    toolUseResult: { status: 'completed', totalDurationMs: 100 },
  });
  const sut = parseLines;

  const result = await sut((async function* () { yield noIdentifierLine; })());

  assert.equal(result.events.length, 0, 'line with no identifying fields must produce no event');
  assert.equal(result.skipped, 0, 'non-rollup line must not count as skipped');
});

// ── 22. parseLines — toolUseResult null is ignored ───────────────────────────

test('Given a JSONL line with toolUseResult: null, when parseLines runs, then no event is emitted', async () => {
  const nullTurLine = JSON.stringify({
    type: 'user',
    sessionId: 'sess-w',
    toolUseResult: null,
  });
  const sut = parseLines;

  const result = await sut((async function* () { yield nullTurLine; })());

  assert.equal(result.events.length, 0, 'null toolUseResult must produce no event');
});

// ── 23. parseLines — slug propagated from line-level field ────────────────────

test('Given a JSONL rollup line with a slug field, when parseLines runs, then the emitted event carries that slug', async () => {
  const rollupLine = JSON.stringify({
    type: 'user',
    sessionId: 'sess-slug',
    slug: 'release-v2',
    toolUseResult: {
      agentType: 'craft:designer',
      resolvedModel: 'claude-sonnet-4-6',
      totalDurationMs: 200,
      totalToolUseCount: 1,
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const sut = parseLines;

  const result = await sut((async function* () { yield rollupLine; })());

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].slug, 'release-v2', 'slug must be propagated from the JSONL line');
});

// ── 24. parseLines — timestamp equal to since cutoff is included (not filtered) ──

test('Given an event whose timestamp exactly equals the since cutoff, when parseLines runs, then the event is included (boundary is open: ts < since, not <=)', async () => {
  const cutoff = '2026-05-01T00:00:00.000Z';
  const exactCutoffLine = JSON.stringify({
    type: 'user',
    sessionId: 'sess-eq',
    slug: null,
    timestamp: cutoff,
    toolUseResult: {
      agentType: 'craft:planner',
      resolvedModel: 'claude-sonnet-4-6',
      totalDurationMs: 100,
      totalToolUseCount: 1,
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const sut = parseLines;

  const result = await sut((async function* () { yield exactCutoffLine; })(), cutoff);

  assert.equal(result.events.length, 1, 'event at exact cutoff timestamp must be included (filter is ts < since)');
});

// ── 25. parseLines — only subagent_type in toolUseResult → event produced ─────

test('Given a rollup line with only subagent_type (no agentType, no resolvedModel), when parseLines runs, then an event is produced', async () => {
  const asyncLines = (...strs) => (async function* () { for (const s of strs) yield s; })();
  const line = JSON.stringify({
    type: 'user',
    sessionId: 'sess-sub',
    toolUseResult: {
      subagent_type: 'code-reviewer',
      totalDurationMs: 100,
      totalToolUseCount: 1,
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const sut = parseLines;

  const result = await sut(asyncLines(line));

  assert.equal(result.events.length, 1);
  assert.equal(result.skipped, 0);
});

// ── 26. parseLines — only resolvedModel in toolUseResult → event produced ─────

test('Given a rollup line with only resolvedModel (no agentType, no subagent_type), when parseLines runs, then an event is produced', async () => {
  const asyncLines = (...strs) => (async function* () { for (const s of strs) yield s; })();
  const line = JSON.stringify({
    type: 'user',
    sessionId: 'sess-res',
    toolUseResult: {
      resolvedModel: 'claude-sonnet-4-6',
      totalDurationMs: 100,
      totalToolUseCount: 1,
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const sut = parseLines;

  const result = await sut(asyncLines(line));

  assert.equal(result.events.length, 1);
});

// ── 27. parseLines — only agentType in toolUseResult → event produced ─────────

test('Given a rollup line with only agentType (no resolvedModel, no subagent_type), when parseLines runs, then an event is produced', async () => {
  const asyncLines = (...strs) => (async function* () { for (const s of strs) yield s; })();
  const line = JSON.stringify({
    type: 'user',
    sessionId: 'sess-agt',
    toolUseResult: {
      agentType: 'craft:designer',
      totalDurationMs: 100,
      totalToolUseCount: 1,
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const sut = parseLines;

  const result = await sut(asyncLines(line));

  assert.equal(result.events.length, 1);
});

// ── 28. parseLines — whitespace-only lines are silent (not counted as malformed) ─

test('Given lines containing only whitespace, when parseLines runs, then skipped count is 0 (whitespace lines are silent, not malformed)', async () => {
  const asyncLines = (...strs) => (async function* () { for (const s of strs) yield s; })();
  const sut = parseLines;

  const result = await sut(asyncLines('   ', '\t', ''));

  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0, 'whitespace-only lines must not increment skipped');
});
