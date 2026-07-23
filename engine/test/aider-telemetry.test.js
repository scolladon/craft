import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { tokensFromAiderCounts, parseLines } from '../src/observability/adapters/aider/telemetry.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/aider');

function fixtureLines(name) {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8').split('\n');
}

async function* asyncLines(lines) {
  for (const line of lines) yield line;
}

const WHITELISTED_FIELDS = [
  'run', 'slug', 'phase', 'role', 'model', 'tokens', 'cacheCreationTtl', 'messages', 'durationMs',
].sort();

// ── 1. tokensFromAiderCounts — the pure sent/received mapping ────────────────

test('Given a sent/received count pair, when tokensFromAiderCounts runs, then it maps sent to input and received to output with zero cache fields', () => {
  const sut = tokensFromAiderCounts;

  const result = sut({ sent: 781, received: 19 });

  assert.deepEqual(result, { input: 781, cacheRead: 0, cacheCreation: 0, output: 19 });
});

test('Given non-finite sent/received values, when tokensFromAiderCounts runs, then every field coerces to 0', () => {
  const sut = tokensFromAiderCounts;

  const result = sut({ sent: 'abc', received: undefined });

  assert.deepEqual(result, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});

// ── 2. parseLines — real captured transcript ──────────────────────────────────

test('Given the real captured aider transcript, when parseLines runs, then exactly one event is returned with the pinned token counts', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('real-session.md')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0].tokens, { input: 781, cacheRead: 0, cacheCreation: 0, output: 19 });
});

test('Given the real captured aider transcript, when parseLines runs, then the event carries the held Model id, a null run, and no markers', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('real-session.md')));

  assert.equal(result.events[0].model, 'ollama_chat/qwen2.5-coder:7b');
  assert.equal(result.events[0].run, null);
  assert.deepEqual(result.markers, []);
});

// ── 3. parseLines — malformed token lines are counted skips, never silent zero ─

test('Given a Tokens line using a k-suffix count, when parseLines runs, then it is a counted skip and yields no event', async () => {
  const sut = parseLines;
  const lines = ['> Tokens: 1.2k sent, 340 received.'];

  const result = await sut(asyncLines(lines));

  assert.equal(result.skipped, 1);
  assert.equal(result.events.length, 0);
});

test('Given a Tokens line using a comma-grouped count, when parseLines runs, then it is a counted skip and yields no event', async () => {
  const sut = parseLines;
  const lines = ['> Tokens: 1,234 sent, 56 received.'];

  const result = await sut(asyncLines(lines));

  assert.equal(result.skipped, 1);
  assert.equal(result.events.length, 0);
});

// ── 4. parseLines — paid form with a trailing Cost clause still maps ─────────

test('Given a Tokens line with a trailing Cost clause, when parseLines runs, then the Cost clause is ignored and the two integers still map', async () => {
  const sut = parseLines;
  const lines = ['> Tokens: 781 sent, 19 received. Cost: $0.02 message, $0.15 session.'];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0].tokens, { input: 781, cacheRead: 0, cacheCreation: 0, output: 19 });
});

// ── 5. parseLines — model held across lines, null before any header ──────────

test('Given a Model header followed by a Tokens line, when parseLines runs, then the event carries the held model id', async () => {
  const sut = parseLines;
  const lines = [
    '> Model: gpt-oss/gpt-20b with whole edit format',
    '> Tokens: 10 sent, 2 received.',
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events[0].model, 'gpt-oss/gpt-20b');
});

test('Given a Tokens line with no preceding Model header, when parseLines runs, then the event model is null', async () => {
  const sut = parseLines;
  const lines = ['> Tokens: 10 sent, 2 received.'];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events[0].model, null);
});

// ── 6. parseLines — since cutoff keyed off the session-start header ──────────

test('Given a session started before a future since cutoff, when parseLines runs, then its token events are dropped', async () => {
  const sut = parseLines;
  const since = '2099-01-01T00:00:00.000Z';
  const lines = [
    '# aider chat started at 2026-07-23 15:57:45',
    '> Tokens: 10 sent, 2 received.',
  ];

  const result = await sut(asyncLines(lines), since);

  assert.equal(result.events.length, 0);
});

test('Given a session started after a past since cutoff, when parseLines runs, then its token events are kept', async () => {
  const sut = parseLines;
  const since = '2000-01-01T00:00:00.000Z';
  const lines = [
    '# aider chat started at 2026-07-23 15:57:45',
    '> Tokens: 10 sent, 2 received.',
  ];

  const result = await sut(asyncLines(lines), since);

  assert.equal(result.events.length, 1);
});

test('Given a Tokens line with no preceding session-start header and a since cutoff, when parseLines runs, then the event is kept', async () => {
  const sut = parseLines;
  const since = '2026-01-01T00:00:00.000Z';
  const lines = ['> Tokens: 10 sent, 2 received.'];

  const result = await sut(asyncLines(lines), since);

  assert.equal(result.events.length, 1);
});

// ── 7. redaction whitelist ────────────────────────────────────────────────────

test('Given any emitted event, when its keys are enumerated, then they are exactly the neutral UsageEvent field set', async () => {
  const sut = parseLines;
  const lines = ['> Tokens: 10 sent, 2 received.'];

  const result = await sut(asyncLines(lines));

  assert.deepEqual(Object.keys(result.events[0]).sort(), WHITELISTED_FIELDS);
});

test('Given an emitted event, when parseLines runs, then role, phase, slug and cacheCreationTtl are null', async () => {
  const sut = parseLines;
  const lines = ['> Tokens: 10 sent, 2 received.'];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events[0].role, null);
  assert.equal(result.events[0].phase, null);
  assert.equal(result.events[0].slug, null);
  assert.equal(result.events[0].cacheCreationTtl, null);
});

test('Given an emitted event, when parseLines runs, then messages is 1 and durationMs is 0', async () => {
  const sut = parseLines;
  const lines = ['> Tokens: 10 sent, 2 received.'];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events[0].messages, 1);
  assert.equal(result.events[0].durationMs, 0);
});

// ── 8. parseLines — empty input ───────────────────────────────────────────────

test('Given empty input, when parseLines runs, then it returns an empty event array with zero skipped and no markers', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines([]));

  assert.deepEqual(result, { events: [], skipped: 0, markers: [] });
});

// ── 9. parseLines — never throws on hostile lines ─────────────────────────────

test('Given structurally hostile line values, when parseLines runs, then it resolves rather than rejecting and no line is counted malformed', async () => {
  const sut = parseLines;
  const lines = [null, undefined, 42, {}, ['array'], '> Tokens: 10 sent, 2 received.'];

  await assert.doesNotReject(() => sut(asyncLines(lines)));
  const result = await sut(asyncLines(lines));
  assert.equal(result.events.length, 1);
  assert.equal(result.skipped, 0);
});

// ── 10. parseLines — anchor, trim, and boundary regressions ──────────────────

test('Given a Tokens line prefixed with leading text, when parseLines runs, then it yields no event and is not counted skipped', async () => {
  const sut = parseLines;
  const lines = ['noise > Tokens: 111 sent, 2 received.'];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0);
});

test('Given a prefixed Model header following a real one, when parseLines runs, then the event keeps the real held model, not the prefixed one', async () => {
  const sut = parseLines;
  const lines = [
    '> Model: real-model with whole edit format',
    'junk > Model: FAKE-model',
    '> Tokens: 10 sent, 1 received.',
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].model, 'real-model');
});

test('Given a prefixed session-start line following a real one, when parseLines runs, then the real start still governs the since cutoff', async () => {
  const sut = parseLines;
  const since = '2050-01-01';
  const lines = [
    '# aider chat started at 2099-01-01',
    'prefix # aider chat started at 2000-01-01',
    '> Tokens: 5 sent, 1 received.',
  ];

  const result = await sut(asyncLines(lines), since);

  assert.equal(result.events.length, 1);
});

test('Given a Tokens line with leading whitespace, when parseLines runs, then trimming still yields the event', async () => {
  const sut = parseLines;
  const lines = ['   > Tokens: 222 sent, 3 received.'];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events.length, 1);
});

test('Given a session start exactly equal to the since cutoff, when parseLines runs, then the boundary is exclusive and the event is kept', async () => {
  const sut = parseLines;
  const since = '2026-07-23 15:57:45';
  const lines = [
    '# aider chat started at 2026-07-23 15:57:45',
    '> Tokens: 10 sent, 1 received.',
  ];

  const result = await sut(asyncLines(lines), since);

  assert.equal(result.events.length, 1);
});

test('Given an unparseable session-start timestamp and a valid future since cutoff, when parseLines runs, then the event is dropped', async () => {
  const sut = parseLines;
  const since = '2099-01-01';
  const lines = [
    '# aider chat started at NOTADATE',
    '> Tokens: 9 sent, 1 received.',
  ];

  const result = await sut(asyncLines(lines), since);

  assert.equal(result.events.length, 0);
});
