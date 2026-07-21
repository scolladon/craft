import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { tokensFromCodexUsage, parseLines } from '../src/observability/adapters/codex/telemetry.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/codex');

function fixtureLines(name) {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8').split('\n');
}

async function* asyncLines(lines) {
  for (const line of lines) yield line;
}

const WHITELISTED_FIELDS = [
  'run', 'slug', 'phase', 'role', 'model', 'tokens', 'cacheCreationTtl', 'messages', 'durationMs',
].sort();

// ── 1. tokensFromCodexUsage — the sum-safe cache/reasoning mapping ────────────

test('Given a usage block where cached_input_tokens is less than input_tokens, when tokensFromCodexUsage runs, then input + cacheRead equals input_tokens exactly', () => {
  const sut = tokensFromCodexUsage;

  const result = sut({ input_tokens: 120, cached_input_tokens: 40, output_tokens: 55, reasoning_output_tokens: 10 });

  assert.equal(result.input + result.cacheRead, 120);
  assert.equal(result.input, 80);
  assert.equal(result.cacheRead, 40);
});

test('Given a usage block where cached_input_tokens exceeds input_tokens, when tokensFromCodexUsage runs, then input floors at 0 and is never negative', () => {
  const sut = tokensFromCodexUsage;

  const result = sut({ input_tokens: 10, cached_input_tokens: 25, output_tokens: 5, reasoning_output_tokens: 0 });

  assert.equal(result.input, 0);
});

test('Given a usage block carrying reasoning_output_tokens, when tokensFromCodexUsage runs, then output equals output_tokens alone and reasoning tokens are not added', () => {
  const sut = tokensFromCodexUsage;

  const result = sut({ input_tokens: 1, cached_input_tokens: 0, output_tokens: 55, reasoning_output_tokens: 999 });

  assert.equal(result.output, 55);
});

test('Given a usage block, when tokensFromCodexUsage runs, then cacheCreation is always 0 (no Codex equivalent is pinned)', () => {
  const sut = tokensFromCodexUsage;

  const result = sut({ input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 });

  assert.equal(result.cacheCreation, 0);
});

test('Given non-numeric token values, when tokensFromCodexUsage runs, then every field coerces to 0', () => {
  const sut = tokensFromCodexUsage;

  const result = sut({ input_tokens: 'abc', cached_input_tokens: null, output_tokens: NaN, reasoning_output_tokens: undefined });

  assert.deepEqual(result, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});

test('Given usage itself is undefined, when tokensFromCodexUsage runs, then it does not throw and every field defaults to 0', () => {
  const sut = tokensFromCodexUsage;

  const result = sut(undefined);

  assert.deepEqual(result, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});

// ── 2. parseLines — single turn.completed mapping ─────────────────────────────

test('Given a single turn.completed line, when parseLines runs, then one UsageEvent is returned', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-turn.jsonl')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 1);
});

test('Given a turn where cached_input_tokens is less than input_tokens, when parseLines runs, then input + cacheRead equals input_tokens exactly', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-turn.jsonl')));

  const { tokens } = result.events[0];
  assert.equal(tokens.input + tokens.cacheRead, 120);
});

test('Given a turn where cached_input_tokens exceeds input_tokens, when parseLines runs, then input floors at 0 and is never negative', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4',
    usage: { input_tokens: 10, cached_input_tokens: 25, output_tokens: 5, reasoning_output_tokens: 0 },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].tokens.input, 0);
});

test('Given a turn carrying reasoning_output_tokens, when parseLines runs, then output equals output_tokens alone and the reasoning tokens are not added', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-turn.jsonl')));

  assert.equal(result.events[0].tokens.output, 55);
});

// ── 3. parseLines — held session id across the stream ────────────────────────

test('Given a stream whose session id arrives on thread.started, when parseLines runs, then every later event carries that id as run', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('multi-turn.jsonl')));

  assert.equal(result.events.length, 3);
  for (const event of result.events) {
    assert.equal(event.run, 'codex-thread-multi-001');
  }
});

test('Given a stream with no thread.started line, when parseLines runs, then run is null rather than undefined', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4',
    usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].run, null);
});

// ── 4. parseLines — malformed line skipped and counted ────────────────────────

test('Given a stream containing a malformed line, when parseLines runs, then the line is skipped and counted and the valid events still return', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('malformed.jsonl')));

  assert.equal(result.skipped, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].run, 'codex-thread-malformed-001');
});

// ── 5. parseLines — non-finite token coercion ─────────────────────────────────

test('Given a turn whose token values are non-numeric strings, when parseLines runs, then each coerces to 0', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4',
    usage: { input_tokens: 'abc', cached_input_tokens: 'abc', output_tokens: 'abc', reasoning_output_tokens: 'abc' },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].tokens.input, 0);
  assert.equal(result.events[0].tokens.output, 0);
});

test('Given a turn whose token values are null, when parseLines runs, then each coerces to 0', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4',
    usage: { input_tokens: null, cached_input_tokens: null, output_tokens: null, reasoning_output_tokens: null },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].tokens.input, 0);
  assert.equal(result.events[0].tokens.output, 0);
});

test('Given a turn.completed line with no usage object at all, when parseLines runs, then every token field coerces to 0', async () => {
  const sut = parseLines;
  const line = JSON.stringify({ type: 'turn.completed', model: 'gpt-5.4' });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].tokens.input, 0);
  assert.equal(result.events[0].tokens.output, 0);
  assert.equal(result.events[0].tokens.cacheRead, 0);
});

// ── 6. parseLines — empty input ───────────────────────────────────────────────

test('Given empty input, when parseLines runs, then it returns an empty event array with zero skipped', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines([]));

  assert.deepEqual(result, { events: [], skipped: 0, markers: [] });
});

// ── 7. parseLines — never throws on structurally hostile lines ───────────────

test('Given structurally hostile lines, when parseLines runs, then it resolves rather than rejecting', async () => {
  const sut = parseLines;
  const lines = [
    JSON.stringify(null),
    JSON.stringify(['turn.completed', 'gpt-5.4']),
    JSON.stringify('turn.completed'),
    JSON.stringify({ a: { b: { c: { d: { e: 'deeply nested' } } } } }),
  ];

  await assert.doesNotReject(() => sut(asyncLines(lines)));
  const result = await sut(asyncLines(lines));
  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0, 'well-formed-but-irrelevant JSON is not malformed');
});

// ── 8. parseLines — since cutoff, epoch-normalized on both sides ─────────────

test('Given a numeric turn timestamp before an ISO since cutoff, when parseLines runs, then the turn is dropped', async () => {
  const sut = parseLines;
  const since = '2099-01-01T00:00:00.000Z';
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4', started_at: 1767225600000,
    usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 0, 'a numeric started_at before an ISO since must not silently fail open');
});

test('Given a numeric turn timestamp after an ISO since cutoff, when parseLines runs, then the turn is kept', async () => {
  const sut = parseLines;
  const since = '2000-01-01T00:00:00.000Z';
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4', started_at: 1767225600000,
    usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1);
});

test('Given a turn whose timestamp equals the cutoff, when parseLines runs, then it is kept (boundary is inclusive)', async () => {
  const sut = parseLines;
  const boundaryEpochMs = 1767225600000;
  const since = new Date(boundaryEpochMs).toISOString();
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4', started_at: boundaryEpochMs,
    usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1);
});

test('Given a turn with no started_at and a since cutoff, when parseLines runs, then the turn is kept (a turn with no timestamp never predates a cutoff)', async () => {
  const sut = parseLines;
  const since = '2026-01-01T00:00:00.000Z';
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4',
    usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1);
});

// ── 9. markers ─────────────────────────────────────────────────────────────

test('Given any stream, when parseLines runs, then markers is an empty array (Codex emits no auto-skip signal text)', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-turn.jsonl')));

  assert.deepEqual(result.markers, []);
});

// ── 10. parseLines — durationMs from turn start/end ───────────────────────────

test('Given a turn.completed with start and end timestamps, when parseLines runs, then durationMs is their difference', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-turn.jsonl')));

  assert.equal(result.events[0].durationMs, 2500);
});

test('Given reversed turn timestamps, when parseLines runs, then durationMs floors at 0', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4',
    started_at: '2026-01-01T00:00:05.000Z', completed_at: '2026-01-01T00:00:00.000Z',
    usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].durationMs, 0);
});

test('Given a turn.completed with no start/end timestamps, when parseLines runs, then durationMs is 0', async () => {
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'turn.completed', model: 'gpt-5.4',
    usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 },
  });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events[0].durationMs, 0);
});

// ── 11. parseLines — non-turn.completed envelopes are excluded, not malformed ─

test('Given a line that is not a turn.completed envelope, when parseLines runs, then it contributes no event and is not counted as malformed', async () => {
  const sut = parseLines;
  const lines = [
    JSON.stringify({ type: 'turn.started' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message' } }),
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0, 'a well-formed but excluded envelope is not malformed');
});

// ── 12. redaction whitelist ────────────────────────────────────────────────────

test('Given any emitted event, when its keys are enumerated, then they are exactly the neutral UsageEvent field set', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-turn.jsonl')));

  assert.deepEqual(Object.keys(result.events[0]).sort(), WHITELISTED_FIELDS);
});

test('Given a turn.completed event, when parseLines runs, then role, phase, slug and cacheCreationTtl are null (not yet pinned)', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-turn.jsonl')));

  assert.equal(result.events[0].role, null);
  assert.equal(result.events[0].phase, null);
  assert.equal(result.events[0].slug, null);
  assert.equal(result.events[0].cacheCreationTtl, null);
});

test('Given a turn.completed event, when parseLines runs, then messages is 1', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-turn.jsonl')));

  assert.equal(result.events[0].messages, 1);
});

// ── 13. property lens — sum-safety across a generated batch ──────────────────

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

test('Given any generated set of well-formed turns, when parseLines runs, then sum(input + cacheRead) equals sum(input_tokens) exactly', async () => {
  const sut = parseLines;
  const rand = mulberry32(20260720);
  const count = 200;
  const lines = [];
  let expectedInputTotal = 0;
  for (let i = 0; i < count; i++) {
    const inputTokens = Math.floor(rand() * 10001); // [0, 10000]
    const cachedInputTokens = Math.floor(rand() * (2 * inputTokens + 1)); // [0, 2 x input_tokens], floor branch included
    expectedInputTotal += inputTokens;
    lines.push(JSON.stringify({
      type: 'turn.completed', model: 'gpt-5.4',
      usage: { input_tokens: inputTokens, cached_input_tokens: cachedInputTokens, output_tokens: 1, reasoning_output_tokens: 0 },
    }));
  }

  const result = await sut(asyncLines(lines));

  const summedInputPlusCacheRead = result.events.reduce((sum, e) => sum + e.tokens.input + e.tokens.cacheRead, 0);
  assert.equal(result.events.length, count);
  assert.equal(summedInputPlusCacheRead, expectedInputTotal);
});

// ── 14. parseLines — persisted rollout envelope (a real captured codex rollout) ─
// The persisted rollout .jsonl (what `--source codex` mines from $CODEX_HOME/sessions)
// does NOT carry the live `turn.completed` stream envelope: its token-bearing record is
// `{type:'event_msg', payload:{type:'token_count', info:{last_token_usage:{...}}}}`, and its
// session id arrives on a `session_meta` record. real-rollout.jsonl is a real capture,
// trimmed to its token-bearing + framing records (token_count `info` byte-for-byte real).

test('Given a real persisted rollout, when parseLines runs, then one event per token_count record is emitted and no line is malformed', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('real-rollout.jsonl')));

  assert.equal(result.events.length, 2, 'the persisted event_msg/token_count envelope must be extracted, not silently dropped');
  assert.equal(result.skipped, 0, 'session_meta / task_started / turn_context are excluded, not malformed');
});

test('Given a real persisted rollout, when parseLines runs, then each event carries the session id from the session_meta record as run', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('real-rollout.jsonl')));

  for (const event of result.events) {
    assert.equal(event.run, '019f841f-658e-7a10-beaa-93cb8039a6c8');
  }
});

test('Given a real persisted rollout, when parseLines runs, then per-turn last_token_usage is mapped (not cumulative total_token_usage)', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('real-rollout.jsonl')));

  // ev0 last_token_usage: input 13106, cached 12544 -> input 562, cacheRead 12544, output 142
  assert.deepEqual(result.events[0].tokens, { input: 562, cacheRead: 12544, cacheCreation: 0, output: 142 });
  // ev1 last_token_usage: input 13271, cached 12544 -> input 727, cacheRead 12544, output 6
  // (cumulative total_token_usage.input at ev1 is 26377 — mapping that would double-count)
  assert.deepEqual(result.events[1].tokens, { input: 727, cacheRead: 12544, cacheCreation: 0, output: 6 });
});

test('Given a real persisted rollout event, when parseLines runs, then its keys are exactly the neutral UsageEvent field set', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('real-rollout.jsonl')));

  assert.deepEqual(Object.keys(result.events[0]).sort(), WHITELISTED_FIELDS);
});

test('Given a real persisted rollout token_count with no per-record model or timing, when parseLines runs, then model is null and durationMs is 0', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('real-rollout.jsonl')));

  assert.equal(result.events[0].model, null);
  assert.equal(result.events[0].durationMs, 0);
  assert.equal(result.events[0].messages, 1);
});

test('Given a token_count record whose timestamp predates the since cutoff, when parseLines runs, then it is dropped', async () => {
  const sut = parseLines;
  const since = '2099-01-01T00:00:00.000Z';
  const line = JSON.stringify({
    timestamp: '2026-07-21T10:01:23.824Z', type: 'event_msg',
    payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 5, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 } } },
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 0, 'a token_count before the cutoff must not fail open');
});

test('Given a token_count record whose timestamp is AFTER the since cutoff, when parseLines runs, then it is kept', async () => {
  const sut = parseLines;
  const since = '2000-01-01T00:00:00.000Z';
  const line = JSON.stringify({
    timestamp: '2026-07-21T10:01:23.824Z', type: 'event_msg',
    payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 5, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 } } },
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1, 'a token_count after the cutoff must be kept, not dropped');
});

// ── 15. parseLines — persisted envelope fails SAFE on malformed records ────────
// The persisted-rollout parser reaches through `payload`/`info` on records other
// binding versions may shape differently; every reach must degrade to null/false/
// zero, never throw (a throw would reject the whole mine over one bad line).

test('Given a session_meta whose session_id and id differ, when parseLines runs, then run is the session_id (it wins over id)', async () => {
  const sut = parseLines;
  const lines = [
    JSON.stringify({ type: 'session_meta', payload: { session_id: 'SID', id: 'ALT' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 3, cached_input_tokens: 0, output_tokens: 1 } } } }),
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events[0].run, 'SID');
});

test('Given a session_meta carrying only id (no session_id), when parseLines runs, then run falls back to id', async () => {
  const sut = parseLines;
  const lines = [
    JSON.stringify({ type: 'session_meta', payload: { id: 'ALT' } }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 3, cached_input_tokens: 0, output_tokens: 1 } } } }),
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events[0].run, 'ALT');
});

test('Given a session_meta with no payload, when parseLines runs, then it does not throw and run stays null', async () => {
  const sut = parseLines;
  const lines = [
    JSON.stringify({ type: 'session_meta' }),
    JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 3, cached_input_tokens: 0, output_tokens: 1 } } } }),
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].run, null);
});

test('Given a non-event_msg record that carries a token_count payload, when parseLines runs, then it is NOT treated as a token_count event', async () => {
  const sut = parseLines;
  const line = JSON.stringify({ type: 'response_item', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 9, cached_input_tokens: 0, output_tokens: 9 } } } });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 0, 'the record type must be event_msg, not merely a token_count payload');
});

test('Given an event_msg with no payload, when parseLines runs, then it is not a token_count record and does not throw', async () => {
  const sut = parseLines;
  const line = JSON.stringify({ type: 'event_msg' });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0);
});

test('Given a token_count record with no info object, when parseLines runs, then it emits an event with zero tokens rather than throwing', async () => {
  const sut = parseLines;
  const line = JSON.stringify({ type: 'event_msg', payload: { type: 'token_count' } });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0].tokens, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});
