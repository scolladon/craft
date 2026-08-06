import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import {
  tokensFromClaudeUsage,
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

// ── 4. tokensFromClaudeUsage — adversarial non-numeric values coerce to 0 (F6) ─

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

// ── 5. tokensFromClaudeUsage — non-object cache_creation yields cacheCreationTtl=null ──

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

// ── 6. parseLines — the emission rule: one usage-bearing line, one event ──────

test('Given an assistant line carrying message.usage and no context, when parseLines runs, then exactly one event is emitted with role main-loop, phase null, and messages 1', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-main',
    slug: 'feature-x',
    timestamp: '2026-01-01T00:00:00.000Z',
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: 15 },
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].role, 'main-loop');
  assert.equal(result.events[0].phase, null);
  assert.equal(result.events[0].messages, 1);
  assert.equal(result.skipped, 0);
});

// ── 7. parseLines — a spawn rollup carries no message.usage, so it emits nothing ──

test('Given a fixture whose only line is a user-role spawn rollup, when parseLines runs, then zero events are emitted and skipped is 0 (a rollup never carries message.usage)', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('rollup-yields-nothing.jsonl')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 0);
});

// ── 8. parseLines — skips malformed lines and counts them ────────────────────

test('Given a fixture with two usage-bearing lines and one malformed line as the third, when parseLines runs, then two events are emitted and skipped is 1', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('malformed.jsonl')));

  assert.equal(result.skipped, 1);
  assert.equal(result.events.length, 2);
});

// ── 9. parseLines — token sums from the 50_000-token fixture line ────────────

test('Given the first line in the malformed fixture whose usage totals 50000, when parseLines runs, then the emitted event token classes sum to 50000', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('malformed.jsonl')));

  const firstEvent = result.events[0];
  const tokenSum = firstEvent.tokens.input + firstEvent.tokens.cacheRead
    + firstEvent.tokens.cacheCreation + firstEvent.tokens.output;
  assert.equal(tokenSum, 50000);
});

// ── 10. parseLines — a line whose toolUseResult carries no message.usage is ignored ──

test('Given a JSONL line whose toolUseResult carries no message.usage, when parseLines runs, then no event is emitted and it does not count as skipped', async () => {
  const sut = parseLines;
  const noUsageLine = JSON.stringify({
    type: 'user',
    sessionId: 'sess-z',
    toolUseResult: { status: 'completed', totalDurationMs: 100 },
  });

  const result = await sut(asyncLines([noUsageLine]));

  assert.equal(result.events.length, 0, 'a line without message.usage must produce no event');
  assert.equal(result.skipped, 0, 'a well-formed non-usage line must not count as skipped');
});

// ── 11. parseLines — a line with no message field at all is ignored ──────────

test('Given a JSONL line with no message field at all, when parseLines runs, then no event is emitted', async () => {
  const sut = parseLines;
  const noMessageLine = JSON.stringify({ type: 'user', sessionId: 'sess-w', toolUseResult: null });

  const result = await sut(asyncLines([noMessageLine]));

  assert.equal(result.events.length, 0, 'a line without a message field must produce no event');
});

// ── 12. parseLines — slug propagated from line-level field ───────────────────

test('Given a usage-bearing JSONL line with a slug field, when parseLines runs, then the emitted event carries that slug', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-slug',
    slug: 'release-v2',
    timestamp: '2026-01-01T00:00:00.000Z',
    message: {
      role: 'assistant', model: 'claude-sonnet-4-6',
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].slug, 'release-v2', 'slug must be propagated from the JSONL line');
});

// ── 13. parseLines — timestamp equal to since cutoff is included (not filtered) ──

test('Given a usage-bearing line whose timestamp exactly equals the since cutoff, when parseLines runs, then the event is included (boundary is open: ts < since, not <=)', async () => {
  const sut = parseLines;
  const cutoff = '2026-05-01T00:00:00.000Z';
  const exactCutoffLine = JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-eq',
    slug: null,
    timestamp: cutoff,
    message: {
      role: 'assistant', model: 'claude-sonnet-4-6',
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });

  const result = await sut(asyncLines([exactCutoffLine]), cutoff);

  assert.equal(result.events.length, 1, 'event at exact cutoff timestamp must be included (filter is ts < since)');
});

// ── 14. parseLines — --since filters events before the cutoff ────────────────

const BEFORE_CUTOFF_LINE = JSON.stringify({
  type: 'assistant',
  sessionId: 'sess-before',
  slug: 'feat',
  timestamp: '2026-01-01T00:00:00.000Z',
  message: {
    role: 'assistant', model: 'claude-sonnet-4-6',
    usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
  },
});

const AFTER_CUTOFF_LINE = JSON.stringify({
  type: 'assistant',
  sessionId: 'sess-after',
  slug: 'feat',
  timestamp: '2026-06-01T00:00:00.000Z',
  message: {
    role: 'assistant', model: 'claude-sonnet-4-6',
    usage: { input_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 2 },
  },
});

test('Given two usage-bearing lines one before and one after the cutoff, when parseLines runs with since, then only the later event survives', async () => {
  const sut = parseLines;
  const since = '2026-03-01T00:00:00.000Z';

  const result = await sut(asyncLines([BEFORE_CUTOFF_LINE, AFTER_CUTOFF_LINE]), since);

  assert.equal(result.events.length, 1, 'only the after-cutoff event must survive');
  assert.equal(result.events[0].run, 'sess-after');
  assert.equal(result.skipped, 0, 'filtered-by-since events are not skipped');
});

// ── 15. parseLines — whitespace-only lines are silent (not counted as malformed) ─

test('Given lines containing only whitespace, when parseLines runs, then skipped count is 0 (whitespace lines are silent, not malformed)', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(['   ', '\t', '']));

  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0, 'whitespace-only lines must not increment skipped');
});

// ── 16. parseLines — sub-agent context: every recognized craft agentType maps phase ──

test('Given each recognized craft agentType via an injected sub-agent context, when parseLines runs, then phase maps to the correct vendor-neutral label', async () => {
  const sut = parseLines;
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
  const usageLine = JSON.stringify({
    type: 'assistant',
    sessionId: 'sess-role',
    timestamp: '2026-01-01T00:00:00.000Z',
    message: {
      role: 'assistant', model: 'claude-sonnet-4-6',
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });

  for (const [agentType, expectedPhase] of Object.entries(ROLE_PHASE_MAP)) {
    const result = await sut(asyncLines([usageLine]), null, { sourceKind: 'subagent', agentType });
    assert.equal(result.events[0].phase, expectedPhase, `${agentType} must map to phase ${expectedPhase}`);
  }
});

// ── 17. parseLines — sub-agent context naming craft:designer resolves role and phase ──

test('Given an injected sub-agent context naming craft:designer, when parseLines runs, then role is designer and phase is design', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('subagent-usage.jsonl')), null, { sourceKind: 'subagent', agentType: 'craft:designer' });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].role, 'designer');
  assert.equal(result.events[0].phase, 'design');
  assert.equal(result.unlabelled, 0);
});

// ── 18. parseLines — sub-agent context with agentType null is counted unlabelled ──

test('Given a sub-agent context whose agentType is null, when parseLines runs, then role and phase are null and unlabelled is 1', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('subagent-usage.jsonl')), null, { sourceKind: 'subagent', agentType: null });

  assert.equal(result.events[0].role, null);
  assert.equal(result.events[0].phase, null);
  assert.equal(result.unlabelled, 1, 'a null-role event must never escape uncounted');
});

// ── 19. parseLines — sub-agent context with a falsy (empty-string) agentType ─────

test('Given a sub-agent context whose agentType is an empty string (falsy), when parseLines runs, then role and phase are null', async () => {
  const sut = parseLines;
  const usageLine = JSON.stringify({
    type: 'assistant', sessionId: 's1', timestamp: '2026-01-01T00:00:00.000Z',
    message: {
      role: 'assistant', model: 'claude-sonnet-4-6',
      usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
    },
  });

  const result = await sut(asyncLines([usageLine]), null, { sourceKind: 'subagent', agentType: '' });

  assert.equal(result.events[0].role, null, 'empty agentType must yield null role');
  assert.equal(result.events[0].phase, null, 'empty agentType must yield null phase');
});

// ── 20. parseLines — non-string model passes through unchanged ───────────────

test('Given a usage line whose message.model is null, when parseLines runs, then the event model is null', async () => {
  const sut = parseLines;
  const usageLine = JSON.stringify({
    type: 'assistant', sessionId: 's1', timestamp: '2026-01-01T00:00:00.000Z',
    message: {
      role: 'assistant', model: null,
      usage: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
    },
  });

  const result = await sut(asyncLines([usageLine]), null, { sourceKind: 'subagent', agentType: 'craft:designer' });

  assert.equal(result.events[0].model, null, 'non-string model must pass through as-is');
});

// ── 21. parseLines — model normalizes the [1m] context-size suffix ───────────

test('Given a usage line whose model ends in [1m], when parseLines runs, then model is normalized to the base id without the suffix', async () => {
  const sut = parseLines;
  const usageLine = JSON.stringify({
    type: 'assistant', sessionId: 's1', timestamp: '2026-01-01T00:00:00.000Z',
    message: {
      role: 'assistant', model: 'claude-opus-4-8[1m]',
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });

  const result = await sut(asyncLines([usageLine]));

  assert.equal(result.events[0].model, 'claude-opus-4-8');
});

// ── 22. parseLines — main-loop durationMs stays 0 on every event, including the last ──

test('Given two usage-bearing main-loop lines, when parseLines runs, then durationMs is 0 on every event including the last', async () => {
  const sut = parseLines;
  const mkLine = (ts, input) => JSON.stringify({
    type: 'assistant', sessionId: 's1', timestamp: ts,
    message: {
      role: 'assistant', model: 'claude-sonnet-4-6',
      usage: { input_tokens: input, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: input },
    },
  });

  const result = await sut(asyncLines([mkLine('2026-01-01T00:00:00.000Z', 1), mkLine('2026-01-01T00:10:00.000Z', 2)]));

  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].durationMs, 0);
  assert.equal(result.events[1].durationMs, 0, 'main-loop duration stays 0 even on the last event');
  assert.equal(result.events[0].messages, 1);
  assert.equal(result.events[1].messages, 1);
});

// ── 23. parseLines — sub-agent durationMs folds the transcript span onto the last event ──

test('Given three sub-agent usage lines with distinct timestamps, when parseLines runs, then durationMs is 0 on every event except the last, which carries the whole span', async () => {
  const sut = parseLines;
  const mkLine = (ts) => JSON.stringify({
    type: 'assistant', sessionId: 'sess-parent', timestamp: ts,
    message: {
      role: 'assistant', model: 'claude-opus-4-8',
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const t0 = '2026-01-01T00:00:00.000Z';
  const t1 = '2026-01-01T00:05:00.000Z';
  const t2 = '2026-01-01T00:12:00.000Z';

  const result = await sut(
    asyncLines([mkLine(t0), mkLine(t1), mkLine(t2)]),
    null,
    { sourceKind: 'subagent', agentType: 'craft:designer' },
  );

  assert.equal(result.events.length, 3);
  assert.equal(result.events[0].durationMs, 0);
  assert.equal(result.events[1].durationMs, 0);
  assert.equal(result.events[2].durationMs, Date.parse(t2) - Date.parse(t0), 'the last event carries the full transcript span');
  assert.ok(result.events.every(e => e.messages === 1));
});

// ── 24. parseLines — sub-agent span is derived only from lines surviving --since ──

test('Given a sub-agent stream straddling a --since cutoff, when parseLines runs, then the span is derived only from surviving lines, not the full transcript lifetime', async () => {
  const sut = parseLines;
  const mkLine = (ts) => JSON.stringify({
    type: 'assistant', sessionId: 'sess-parent', timestamp: ts,
    message: {
      role: 'assistant', model: 'claude-opus-4-8',
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const beforeCutoff = '2026-01-01T00:00:00.000Z';
  const firstSurviving = '2026-03-01T00:00:00.000Z';
  const lastSurviving = '2026-03-01T00:07:00.000Z';
  const since = '2026-02-01T00:00:00.000Z';

  const result = await sut(
    asyncLines([mkLine(beforeCutoff), mkLine(firstSurviving), mkLine(lastSurviving)]),
    since,
    { sourceKind: 'subagent', agentType: 'craft:designer' },
  );

  assert.equal(result.events.length, 2, 'the before-cutoff line must not survive the since filter');
  assert.equal(
    result.events[1].durationMs,
    Date.parse(lastSurviving) - Date.parse(firstSurviving),
    'the span must be measured over surviving lines only, excluding the dropped one',
  );
});

// ── 25. parseLines — context.includeInline === false suppresses main-loop emission ──

test('Given context.includeInline is false on a main-loop stream, when parseLines runs, then zero events are emitted but markers still return', async () => {
  const sut = parseLines;
  const usageLine = JSON.stringify({
    type: 'assistant', sessionId: 'sess-x', timestamp: '2026-01-01T00:00:00.000Z',
    message: {
      role: 'assistant', model: 'claude-sonnet-4-6',
      usage: { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 },
    },
  });
  const markerLine = JSON.stringify({
    type: 'assistant', sessionId: 'sess-x',
    message: { role: 'assistant', content: [{ type: 'text', text: 'auto-skip: review — evaluated unnecessary (no source diff in scope)' }] },
  });

  const result = await sut(asyncLines([usageLine, markerLine]), null, { includeInline: false });

  assert.equal(result.events.length, 0, 'inline suppression must produce no events');
  assert.deepEqual(result.markers, [{ run: 'sess-x', phase: 'review' }], 'markers must still be returned under suppression');
});

// ── 26. parseLines — run is the sessionId; a sub-agent line's slug is null ───

test('Given a sub-agent usage line with no slug field, when parseLines runs, then run is the sessionId and slug is null', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('subagent-usage.jsonl')), null, { sourceKind: 'subagent', agentType: 'craft:designer' });

  assert.equal(result.events[0].run, 'sess-parent');
  assert.equal(result.events[0].slug, null, 'sub-agent lines carry no slug — it must resolve to null, not undefined');
});

// ── phase-skip markers (auto-skip run-record token) ───────────────────────────

test('Given an assistant line carrying an auto-skip token, when parseLines runs, then it emits a run+phase marker', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'run-skip',
    message: { role: 'assistant', content: [{ type: 'text', text: 'auto-skip: review — evaluated unnecessary (no source diff in scope)' }] },
  });

  const result = await sut(asyncLines([line]));

  assert.deepEqual(result.markers, [{ run: 'run-skip', phase: 'review' }]);
});

test('Given an auto-skip marker line, when parseLines runs, then the marker carries only run and phase (redaction-safe)', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'run-skip',
    message: { role: 'assistant', content: [{ type: 'text', text: 'auto-skip: decisions — evaluated unnecessary (all clear)' }] },
  });

  const result = await sut(asyncLines([line]));

  assert.deepEqual(Object.keys(result.markers[0]).sort(), ['phase', 'run']);
});

test('Given lines with no auto-skip token, when parseLines runs, then markers is empty', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'run-1',
    message: { role: 'assistant', content: [{ type: 'text', text: 'the review phase produced findings' }] },
  });

  const result = await sut(asyncLines([line]));

  assert.deepEqual(result.markers, []);
});

test('Given an assistant line whose content is a plain string with an auto-skip token, when parseLines runs, then it still emits the marker', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'run-str',
    message: { role: 'assistant', content: 'auto-skip: refactoring — evaluated unnecessary (no gain)' },
  });

  const result = await sut(asyncLines([line]));

  assert.deepEqual(result.markers, [{ run: 'run-str', phase: 'refactoring' }]);
});

// ── 27. parseLines — auto-skip scanning is gated off for sub-agent streams ───

test('Given identical auto-skip text fed through a main-loop context and a sub-agent context, when parseLines runs, then the marker is emitted only from the main-loop stream', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'assistant',
    sessionId: 'run-guard',
    message: { role: 'assistant', content: [{ type: 'text', text: 'auto-skip: review — evaluated unnecessary (no source diff in scope)' }] },
  });

  const mainResult = await sut(asyncLines([line]), null, { sourceKind: 'main' });
  const subagentResult = await sut(asyncLines([line]), null, { sourceKind: 'subagent', agentType: 'craft:docs-writer' });

  assert.deepEqual(mainResult.markers, [{ run: 'run-guard', phase: 'review' }], 'main-loop stream must still surface the marker');
  assert.deepEqual(subagentResult.markers, [], 'a sub-agent transcript must never inject a run-record marker from its own output');
});

// ── 28. parseLines — property lens: permuted mixed streams ───────────────────

// Deterministic PRNG (mulberry32) — no Math.random, so the batch is reproducible.
function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, rand) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

test('Given a generated mix of rollup lines, usage lines, blank lines and malformed JSON in arbitrary order, when parseLines runs, then total tokens equal the sum over usage lines alone and skipped equals the malformed count exactly, invariant under permutation', async () => {
  const sut = parseLines;
  const rand = mulberry32(20260214);

  const usageLines = [];
  let expectedTotal = 0;
  for (let i = 0; i < 30; i++) {
    const inputTokens = Math.floor(rand() * 1000);
    expectedTotal += inputTokens;
    usageLines.push(JSON.stringify({
      type: 'assistant', sessionId: `sess-${i}`, timestamp: '2026-01-01T00:00:00.000Z',
      message: {
        role: 'assistant', model: 'claude-sonnet-4-6',
        usage: { input_tokens: inputTokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 },
      },
    }));
  }
  const rollupLines = [];
  for (let i = 0; i < 10; i++) {
    rollupLines.push(JSON.stringify({
      type: 'user', sessionId: `sess-rollup-${i}`,
      toolUseResult: { agentType: 'craft:designer', totalDurationMs: 1000, totalToolUseCount: 1, usage: { input_tokens: 999999 } },
    }));
  }
  const blankLines = ['', '   ', '\t'];
  const malformedLines = ['{bad', 'not json', '{{{'];
  const allLines = [...usageLines, ...rollupLines, ...blankLines, ...malformedLines];

  const firstRun = await sut(asyncLines(shuffled(allLines, rand)));
  const secondRun = await sut(asyncLines(shuffled(allLines, rand)));

  for (const run of [firstRun, secondRun]) {
    assert.equal(run.events.length, usageLines.length, 'only usage-bearing lines emit events');
    assert.equal(run.skipped, malformedLines.length, 'skipped must equal the malformed count exactly');
    const total = run.events.reduce((sum, e) => sum + e.tokens.input, 0);
    assert.equal(total, expectedTotal, 'total emitted tokens must equal the sum over usage lines alone');
  }
});
