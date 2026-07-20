import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { parseLines } from '../src/observability/adapters/copilot/telemetry.js';
import { aggregate } from '../src/observability/usage-aggregate.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/copilot');

function fixtureLines(name) {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8').split('\n');
}

async function* asyncLines(lines) {
  for (const line of lines) yield line;
}

const WHITELISTED_FIELDS = [
  'run', 'slug', 'phase', 'role', 'model', 'tokens', 'cacheCreationTtl', 'messages', 'durationMs',
].sort();

function chatSpanLine({ conversationId, input, output, model = 'gpt-4o', startTime, endTime } = {}) {
  return JSON.stringify({
    name: 'chat gpt-4o',
    kind: 'CLIENT',
    instrumentationScope: { name: 'github.copilot' },
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': conversationId,
      'gen_ai.response.model': model,
      'gen_ai.usage.input_tokens': input,
      'gen_ai.usage.output_tokens': output,
    },
    startTime,
    endTime,
  });
}

// ── 1. parseLines — single chat span mapping ──────────────────────────────────

test('Given a single chat span line, when parseLines runs, then it emits one UsageEvent carrying the conversation id as run, the response model, and the span input/output tokens', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-chat.jsonl')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].run, 'conv-single-001');
  assert.equal(result.events[0].model, 'gpt-4o-2024-11-20');
  assert.equal(result.events[0].tokens.input, 42);
  assert.equal(result.events[0].tokens.output, 17);
});

test('Given a single chat span with startTime and endTime, when parseLines runs, then durationMs is the difference in ms', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-chat.jsonl')));

  assert.equal(result.events[0].durationMs, 2500);
});

test('Given a chat span with no startTime/endTime fields, when parseLines runs, then durationMs is 0', async () => {
  const sut = parseLines;
  const line = chatSpanLine({ conversationId: 'conv-no-time', input: 1, output: 1 });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].durationMs, 0);
});

test('Given a chat span whose startTime is absent but endTime is present, when parseLines runs, then durationMs is 0', async () => {
  const sut = parseLines;
  const line = chatSpanLine({
    conversationId: 'conv-only-end', input: 1, output: 1,
    endTime: '2026-01-01T00:00:01.000Z',
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].durationMs, 0, 'both endpoints are required to compute a duration');
});

test('Given a chat span whose startTime is unparseable but endTime is a valid date string, when parseLines runs, then durationMs falls back to the endTime epoch (unparseable start coerces to 0)', async () => {
  const sut = parseLines;
  const line = chatSpanLine({
    conversationId: 'conv-bad-start', input: 1, output: 1,
    startTime: 'not-a-real-date', endTime: '2026-01-01T00:00:01.000Z',
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].durationMs, Date.parse('2026-01-01T00:00:01.000Z'));
});

test('Given a chat span whose response model is absent, when parseLines runs, then model falls back to the request model', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'chat gpt-4o',
    kind: 'CLIENT',
    instrumentationScope: { name: 'github.copilot' },
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': 'conv-fallback-model',
      'gen_ai.request.model': 'gpt-4o-requested',
      'gen_ai.usage.input_tokens': 1,
      'gen_ai.usage.output_tokens': 1,
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].model, 'gpt-4o-requested');
});

// ── 2. parseLines — THE NO-DOUBLE-COUNT TEST ──────────────────────────────────

test('Given two chat spans, their invoke_agent roll-up, an execute_tool span and the gen_ai.client.token.usage metric, when parseLines runs, then exactly two events are emitted and token totals equal the two leaves, not three times them', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('rollup-and-metric.jsonl')));

  assert.equal(result.events.length, 2, 'only the two leaf chat spans must be counted');
  const totalInput = result.events.reduce((sum, e) => sum + e.tokens.input, 0);
  const totalOutput = result.events.reduce((sum, e) => sum + e.tokens.output, 0);
  assert.equal(totalInput, 2468, 'summed input must equal the two leaves (2 x 1234), not the rolled-up sum counted again');
  assert.equal(totalOutput, 112, 'summed output must equal the two leaves (2 x 56), not the rolled-up sum counted again');
});

// ── 3. parseLines — metric record discrimination (no kind, no instrumentationScope) ──

test('Given a metric record with no kind and no instrumentationScope, when parseLines runs, then it is ignored and no event is emitted', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'gen_ai.client.token.usage',
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': 'conv-metric-only',
      'gen_ai.usage.input_tokens': 999,
      'gen_ai.usage.output_tokens': 999,
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0, 'a well-formed but excluded record is not malformed');
});

test('Given a span-shaped record with the Copilot instrumentation scope and chat attributes but no kind field, when parseLines runs, then it is excluded (kind is what distinguishes a span from a metric record)', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'chat gpt-4o',
    instrumentationScope: { name: 'github.copilot' },
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': 'conv-no-kind',
      'gen_ai.usage.input_tokens': 5,
      'gen_ai.usage.output_tokens': 5,
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 0);
});

// ── 4. parseLines — invoke_agent / execute_tool spans in isolation ────────────

test('Given an invoke_agent span in isolation, when parseLines runs, then no event is emitted', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'invoke_agent',
    kind: 'INTERNAL',
    instrumentationScope: { name: 'github.copilot' },
    attributes: {
      'gen_ai.operation.name': 'invoke_agent',
      'gen_ai.conversation.id': 'conv-invoke-only',
      'gen_ai.usage.input_tokens': 2468,
      'gen_ai.usage.output_tokens': 112,
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 0);
});

test('Given an execute_tool span in isolation, when parseLines runs, then no event is emitted', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'execute_tool bash',
    kind: 'INTERNAL',
    instrumentationScope: { name: 'github.copilot' },
    attributes: {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.conversation.id': 'conv-tool-only',
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 0);
});

// ── 5. parseLines — foreign instrumentation scope ─────────────────────────────

test('Given a span whose instrumentationScope.name is some other library, when parseLines runs, then it is ignored', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'chat gpt-4o',
    kind: 'CLIENT',
    instrumentationScope: { name: 'some-other-otel-producer' },
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': 'conv-foreign',
      'gen_ai.usage.input_tokens': 5,
      'gen_ai.usage.output_tokens': 5,
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 0);
});

// ── 6. parseLines — non-finite / missing token attribute coercion ─────────────

test('Given a chat span whose token attributes are non-numeric strings, when parseLines runs, then both token fields coerce to 0', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'chat gpt-4o',
    kind: 'CLIENT',
    instrumentationScope: { name: 'github.copilot' },
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': 'conv-nonfinite-abc',
      'gen_ai.usage.input_tokens': 'abc',
      'gen_ai.usage.output_tokens': 'abc',
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].tokens.input, 0);
  assert.equal(result.events[0].tokens.output, 0);
});

test('Given a chat span whose token attributes are the string "NaN", when parseLines runs, then both token fields coerce to 0', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'chat gpt-4o',
    kind: 'CLIENT',
    instrumentationScope: { name: 'github.copilot' },
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': 'conv-nonfinite-nan',
      'gen_ai.usage.input_tokens': 'NaN',
      'gen_ai.usage.output_tokens': 'NaN',
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].tokens.input, 0);
  assert.equal(result.events[0].tokens.output, 0);
});

test('Given a chat span whose token attributes are null, when parseLines runs, then both token fields coerce to 0', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'chat gpt-4o',
    kind: 'CLIENT',
    instrumentationScope: { name: 'github.copilot' },
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': 'conv-nonfinite-null',
      'gen_ai.usage.input_tokens': null,
      'gen_ai.usage.output_tokens': null,
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].tokens.input, 0);
  assert.equal(result.events[0].tokens.output, 0);
});

test('Given a chat span whose token attributes are absent entirely, when parseLines runs, then both token fields coerce to 0', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'chat gpt-4o',
    kind: 'CLIENT',
    instrumentationScope: { name: 'github.copilot' },
    attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.conversation.id': 'conv-nonfinite-absent',
    },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].tokens.input, 0);
  assert.equal(result.events[0].tokens.output, 0);
});

// ── 7. parseLines — malformed line skipped and counted ────────────────────────

test('Given a malformed line among valid ones, when parseLines runs, then the line is skipped, skipped is 1, and the valid events are still returned', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('malformed.jsonl')));

  assert.equal(result.skipped, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].run, 'conv-malformed-001');
});

test('Given a whitespace-only line among valid lines, when parseLines runs, then the line is silently ignored and not counted as skipped', async () => {
  const sut = parseLines;
  const validLine = chatSpanLine({ conversationId: 'conv-ws', input: 1, output: 1 });

  const result = await sut(asyncLines(['   ', validLine]));

  assert.equal(result.skipped, 0, 'a whitespace-only line is blank, not malformed');
  assert.equal(result.events.length, 1);
});

// ── 8. parseLines — never throws on structurally hostile records ──────────────

test('Given a chat span with null attributes, when parseLines runs, then it resolves rather than rejecting and no event is emitted', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'chat gpt-4o',
    kind: 'CLIENT',
    instrumentationScope: { name: 'github.copilot' },
    attributes: null,
  });

  await assert.doesNotReject(() => sut(asyncLines([line])));
  const result = await sut(asyncLines([line]));
  assert.equal(result.events.length, 0);
  assert.ok(result);
});

test('Given a chat-looking span with null instrumentationScope, when parseLines runs, then it resolves rather than rejecting and no event is emitted', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    name: 'chat gpt-4o',
    kind: 'CLIENT',
    instrumentationScope: null,
    attributes: { 'gen_ai.operation.name': 'chat', 'gen_ai.usage.input_tokens': 1 },
  });

  await assert.doesNotReject(() => sut(asyncLines([line])));
  const result = await sut(asyncLines([line]));
  assert.equal(result.events.length, 0);
  assert.ok(result);
});

test('Given a line encoding a bare JSON null, when parseLines runs, then it resolves rather than rejecting and the line is not counted as malformed', async () => {
  const sut = parseLines;

  await assert.doesNotReject(() => sut(asyncLines(['null'])));
  const result = await sut(asyncLines(['null']));
  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0);
});

test('Given a line encoding a JSON array, when parseLines runs, then it resolves rather than rejecting and no event is emitted', async () => {
  const sut = parseLines;
  const line = JSON.stringify(['chat', 'gpt-4o']);

  await assert.doesNotReject(() => sut(asyncLines([line])));
  const result = await sut(asyncLines([line]));
  assert.equal(result.events.length, 0);
});

test('Given a line encoding a bare JSON number, when parseLines runs, then it resolves rather than rejecting and no event is emitted', async () => {
  const sut = parseLines;

  await assert.doesNotReject(() => sut(asyncLines(['42'])));
  const result = await sut(asyncLines(['42']));
  assert.equal(result.events.length, 0);
});

// ── 9. parseLines — empty input ────────────────────────────────────────────────

test('Given empty input, when parseLines runs, then it returns an empty result with zero skipped and empty markers', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines([]));

  assert.deepEqual(result, { events: [], skipped: 0, markers: [] });
});

// ── 10. parseLines — since cutoff ──────────────────────────────────────────────

test('Given a since cutoff later than the span start time, when parseLines runs, then the span is dropped', async () => {
  const sut = parseLines;
  const since = '2026-06-01T00:00:00.000Z';
  const line = chatSpanLine({
    conversationId: 'conv-before-cutoff', input: 1, output: 1,
    startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:00:01.000Z',
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 0);
});

test('Given a since cutoff earlier than the span start time, when parseLines runs, then the span is kept', async () => {
  const sut = parseLines;
  const since = '2026-01-01T00:00:00.000Z';
  const line = chatSpanLine({
    conversationId: 'conv-after-cutoff', input: 1, output: 1,
    startTime: '2026-06-01T00:00:00.000Z', endTime: '2026-06-01T00:00:01.000Z',
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1);
});

test('Given a numeric startTime before an ISO since cutoff, when parseLines runs, then the span is dropped', async () => {
  const sut = parseLines;
  const since = '2099-01-01T00:00:00.000Z';
  const line = chatSpanLine({
    conversationId: 'conv-numeric-before-cutoff', input: 1, output: 1,
    startTime: 1767225600000, endTime: 1767225601000,
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 0, 'a numeric startTime before an ISO since must not silently fail open');
});

test('Given a numeric startTime after an ISO since cutoff, when parseLines runs, then the span is kept', async () => {
  const sut = parseLines;
  const since = '2000-01-01T00:00:00.000Z';
  const line = chatSpanLine({
    conversationId: 'conv-numeric-after-cutoff', input: 1, output: 1,
    startTime: 1767225600000, endTime: 1767225601000,
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1);
});

test('Given a numeric startTime exactly equal to the since cutoff, when parseLines runs, then the span is kept (boundary is inclusive, not "before")', async () => {
  const sut = parseLines;
  const boundaryEpochMs = 1767225600000;
  const since = new Date(boundaryEpochMs).toISOString();
  const line = chatSpanLine({
    conversationId: 'conv-numeric-boundary', input: 1, output: 1,
    startTime: boundaryEpochMs, endTime: boundaryEpochMs + 1000,
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1);
});

test('Given a chat span with no startTime and a since cutoff, when parseLines runs, then the span is kept (a span with no timestamp never predates a cutoff)', async () => {
  const sut = parseLines;
  const since = '2026-01-01T00:00:00.000Z';
  const line = chatSpanLine({ conversationId: 'conv-no-start-with-cutoff', input: 1, output: 1 });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1);
});

// ── 11. parseLines — redaction whitelist ───────────────────────────────────────

test('Given any emitted event, when its keys are enumerated, then they are exactly the neutral UsageEvent field set', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-chat.jsonl')));

  assert.deepEqual(Object.keys(result.events[0]).sort(), WHITELISTED_FIELDS);
});

test('Given a chat span, when parseLines runs, then role, phase, slug and cacheCreationTtl are null and cache tokens are 0 (no Copilot equivalent is pinned)', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-chat.jsonl')));

  assert.equal(result.events[0].role, null);
  assert.equal(result.events[0].phase, null);
  assert.equal(result.events[0].slug, null);
  assert.equal(result.events[0].cacheCreationTtl, null);
  assert.equal(result.events[0].tokens.cacheRead, 0);
  assert.equal(result.events[0].tokens.cacheCreation, 0);
});

// ── 12. parseLines + aggregate — property/round-trip ───────────────────────────

test('Given a generated set of well-formed chat span lines, when parsed and aggregated, then the aggregate token sums equal the input sums', async () => {
  const sut = parseLines;
  const count = 50;
  const lines = [];
  let expectedInput = 0;
  let expectedOutput = 0;
  for (let i = 0; i < count; i++) {
    const input = (i * 7 % 97) + 1;
    const output = (i * 13 % 53) + 1;
    expectedInput += input;
    expectedOutput += output;
    lines.push(chatSpanLine({ conversationId: 'conv-property', input, output, model: 'gpt-4o' }));
  }

  const { events } = await sut(asyncLines(lines));
  const report = aggregate(events, {});

  assert.equal(events.length, count);
  const run = report.runs.find((r) => r.run === 'conv-property');
  assert.equal(run.groups.length, 1);
  assert.equal(run.groups[0].tokens.input, expectedInput);
  assert.equal(run.groups[0].tokens.output, expectedOutput);
  assert.equal(run.groups[0].messages, count);
});

// ── 13. markers ─────────────────────────────────────────────────────────────

test('Given any input stream, when parseLines runs, then markers is always an empty array (Copilot has no auto-skip signal text)', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-chat.jsonl')));

  assert.deepEqual(result.markers, []);
});
