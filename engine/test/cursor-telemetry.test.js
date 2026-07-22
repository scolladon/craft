import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { tokensFromCursorUsage, parseLines } from '../src/observability/adapters/cursor/telemetry.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/cursor');

function fixtureLines(name) {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8').split('\n');
}

async function* asyncLines(lines) {
  for (const line of lines) yield line;
}

const WHITELISTED_FIELDS = [
  'run', 'slug', 'phase', 'role', 'model', 'tokens', 'cacheCreationTtl', 'messages', 'durationMs',
].sort();

// ── tokensFromCursorUsage — disjoint Anthropic-convention mapping ────────────

test('Given a usage block, when tokensFromCursorUsage runs, then each of the four counts maps directly (disjoint, no cap)', () => {
  const sut = tokensFromCursorUsage;

  const result = sut({ inputTokens: 4646, outputTokens: 120, cacheReadTokens: 21760, cacheWriteTokens: 33 });

  assert.deepEqual(result, { input: 4646, cacheRead: 21760, cacheCreation: 33, output: 120 });
});

test('Given cacheReadTokens exceeding inputTokens (the real disjoint case), when mapped, then cacheRead is preserved in full (never capped away)', () => {
  const sut = tokensFromCursorUsage;

  const result = sut({ inputTokens: 4646, cacheReadTokens: 21760, outputTokens: 1, cacheWriteTokens: 0 });

  assert.equal(result.cacheRead, 21760);
  assert.equal(result.input, 4646);
});

test('Given non-numeric token values, when tokensFromCursorUsage runs, then every field coerces to 0', () => {
  const sut = tokensFromCursorUsage;

  const result = sut({ inputTokens: 'x', outputTokens: null, cacheReadTokens: undefined, cacheWriteTokens: NaN });

  assert.deepEqual(result, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});

test('Given an absent usage object, when tokensFromCursorUsage runs, then it returns all-zero (no throw)', () => {
  const sut = tokensFromCursorUsage;

  const result = sut(undefined);

  assert.deepEqual(result, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});

// ── parseLines over the REAL captured rollout ────────────────────────────────

test('Given the real result envelope, when parsed, then it yields exactly one UsageEvent with the pinned disjoint tokens', async () => {
  const sut = parseLines;

  const { events, skipped } = await sut(asyncLines(fixtureLines('real-result-envelope.json')));

  assert.equal(events.length, 1);
  assert.equal(skipped, 0);
  assert.deepEqual(events[0].tokens, { input: 4646, cacheRead: 21760, cacheCreation: 0, output: 120 });
});

test('Given the real result envelope, when parsed, then the event carries the session_id as run and duration_ms', async () => {
  const sut = parseLines;

  const { events } = await sut(asyncLines(fixtureLines('real-result-envelope.json')));

  assert.equal(events[0].run, '47a6d157-a791-4b6d-b00b-829cfde065a0');
  assert.equal(events[0].durationMs, 7372);
  assert.equal(events[0].model, null);
  assert.equal(events[0].messages, 1);
});

test('Given a result envelope with NO session_id, when parsed, then run falls back to null', async () => {
  const sut = parseLines;

  const lines = ['{"type":"result","usage":{"inputTokens":1,"outputTokens":1,"cacheReadTokens":0,"cacheWriteTokens":0},"duration_ms":5}'];
  const { events } = await sut(asyncLines(lines));

  assert.equal(events[0].run, null);
});

test('Given a non-result line that nonetheless carries a usage block, when parsed, then it yields NO event (only type:result counts, the && is not an ||)', async () => {
  const sut = parseLines;

  const lines = ['{"type":"turn_ended","usage":{"inputTokens":9,"outputTokens":9,"cacheReadTokens":9,"cacheWriteTokens":9}}'];
  const { events } = await sut(asyncLines(lines));

  assert.equal(events.length, 0);
});

test('Given a JSON null line, when parsed, then it is handled without throwing and yields no event (parsed?.type guards the null)', async () => {
  const sut = parseLines;

  const lines = ['null', '{"type":"result","usage":{"inputTokens":2,"outputTokens":1,"cacheReadTokens":0,"cacheWriteTokens":0},"session_id":"s","duration_ms":1}'];
  const { events, skipped } = await sut(asyncLines(lines));

  assert.equal(events.length, 1);
  assert.equal(skipped, 0);
});

test('Given a whitespace-only line, when parsed, then it is skipped by trimming — not counted as a malformed skip', async () => {
  const sut = parseLines;

  const lines = ['   ', '{"type":"result","usage":{"inputTokens":1,"outputTokens":1,"cacheReadTokens":0,"cacheWriteTokens":0},"session_id":"s","duration_ms":1}'];
  const { events, skipped } = await sut(asyncLines(lines));

  assert.equal(events.length, 1);
  assert.equal(skipped, 0);
});

test('Given any parse, when it returns, then markers is an empty array (Cursor emits no auto-skip signal text)', async () => {
  const sut = parseLines;

  const { markers } = await sut(asyncLines(fixtureLines('real-result-envelope.json')));

  assert.deepEqual(markers, []);
});

test('Given the real result envelope event, when its keys are listed, then they are exactly the whitelisted UsageEvent fields', async () => {
  const sut = parseLines;

  const { events } = await sut(asyncLines(fixtureLines('real-result-envelope.json')));

  assert.deepEqual(Object.keys(events[0]).sort(), WHITELISTED_FIELDS);
});

test('Given the real PERSISTED transcript (token-less), when parsed, then it yields ZERO events and ZERO skipped (structural, not malformed)', async () => {
  const sut = parseLines;

  const { events, skipped } = await sut(asyncLines(fixtureLines('real-transcript.jsonl')));

  assert.equal(events.length, 0);
  assert.equal(skipped, 0);
});

test('Given a stream that mixes malformed lines with a result envelope, when parsed, then malformed increments skipped and the result still yields an event', async () => {
  const sut = parseLines;

  const lines = ['not json {{{', '{"type":"result","usage":{"inputTokens":5,"outputTokens":2,"cacheReadTokens":0,"cacheWriteTokens":0},"session_id":"s","duration_ms":10}'];
  const { events, skipped } = await sut(asyncLines(lines));

  assert.equal(events.length, 1);
  assert.equal(skipped, 1);
});

test('Given a since cutoff, when parsed, then it is a documented no-op for Cursor (no per-record timestamp) — the event is still emitted', async () => {
  const sut = parseLines;

  const { events } = await sut(asyncLines(fixtureLines('real-result-envelope.json')), '2999-01-01T00:00:00Z');

  assert.equal(events.length, 1);
});
