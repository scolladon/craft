import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { tokensFromPiUsage, parseLines } from '../src/observability/adapters/pi/telemetry.js';
import { parseLines as parseClaudeLines } from '../src/observability/adapters/claude/telemetry.js';
import { aggregate, serializeReport } from '../src/observability/usage-aggregate.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/pi');
const CLAUDE_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/telemetry');

function fixtureLines(name) {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8').split('\n');
}

function claudeFixtureLines(name) {
  return readFileSync(join(CLAUDE_FIXTURE_DIR, name), 'utf8').split('\n');
}

async function* asyncLines(lines) {
  for (const line of lines) yield line;
}

const WHITELISTED_FIELDS = [
  'run', 'slug', 'phase', 'role', 'model', 'tokens', 'cacheCreationTtl', 'messages', 'durationMs',
].sort();

// ── 1. tokensFromPiUsage — cacheWrite maps to cacheCreation, numOrZero coercion ──

test('Given a raw pi message.usage object, when tokensFromPiUsage runs, then cacheWrite maps to cacheCreation and the rest map 1:1', () => {
  const usage = { input: 2, output: 900, cacheRead: 196062, cacheWrite: 255, totalTokens: 197164, cost: { total: 0.01 } };
  const sut = tokensFromPiUsage;

  const result = sut(usage);

  assert.deepEqual(result, { input: 2, cacheRead: 196062, cacheCreation: 255, output: 900 });
});

test('Given a message.usage object with non-numeric values, when tokensFromPiUsage runs, then all fields coerce to 0', () => {
  const usage = { input: 'bad', output: NaN, cacheRead: null, cacheWrite: undefined };
  const sut = tokensFromPiUsage;

  const result = sut(usage);

  assert.deepEqual(result, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});

test('Given usage itself is undefined, when tokensFromPiUsage runs, then it does not throw and every field defaults to 0', () => {
  const sut = tokensFromPiUsage;

  const result = sut(undefined);

  assert.deepEqual(result, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});

// ── 2. parseLines — mapping: stateful session id, model, tokens.cacheCreation, role/phase null ──

test('Given a session-header line followed by an assistant message_end line, when parseLines runs, then the emitted event carries the header id as run even though the message line does not repeat it', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-run.jsonl')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].run, 'pi-sess-aaa');
  assert.equal(result.events[0].role, null);
  assert.equal(result.events[0].phase, null);
  assert.equal(result.events[0].model, 'anthropic/claude-sonnet-4-5');
  assert.equal(result.events[0].tokens.cacheCreation, 255);
});

// ── 2b. parseLines — non-message_end lines carrying usage are type-gated out ──────

test('Given a message_start line carrying message.usage before the message_end line, when parseLines runs, then only the message_end produces an event (the type gate ignores the earlier usage)', async () => {
  const sut = parseLines;
  const lines = [
    JSON.stringify({ type: 'session', id: 'pi-sess-ttt' }),
    JSON.stringify({ type: 'message_start', message: { usage: { input: 5, output: 0, cacheRead: 0, cacheWrite: 0 }, model: 'anthropic/claude-sonnet-4-5' } }),
    JSON.stringify({ type: 'message_end', message: { usage: { input: 100, output: 200, cacheRead: 0, cacheWrite: 255 }, model: 'anthropic/claude-sonnet-4-5' } }),
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].tokens.input, 100);
});

// ── 3. parseLines — synthetic-model exclusion ────────────────────────────────────

test('Given a fixture whose only message_end line carries model <synthetic>, when parseLines runs, then events is empty and skipped is 0', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('with-synthetic.jsonl')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 0);
});

// ── 4. parseLines — malformed line skipped and counted, surrounding lines unaffected ──

test('Given a fixture with one valid message_end line and one malformed trailing line, when parseLines runs, then one event is emitted and skipped is 1', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('malformed.jsonl')));

  assert.equal(result.skipped, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].run, 'pi-sess-bbb');
  assert.equal(result.events[0].model, 'anthropic/claude-haiku-4-5');
});

// ── 5. parseLines — redaction: whitelist-only keys, no PII leak ──────────────────

test('Given a fixture event whose header carries cwd, home, user and prompt, when parseLines runs, then the emitted event has only the whitelisted UsageEvent keys', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-run.jsonl')));

  assert.deepEqual(Object.keys(result.events[0]).sort(), WHITELISTED_FIELDS);
});

test('Given a fixture header carrying a path, home directory, username and prompt text, when parseLines runs, then none of those values leak into the emitted event', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-run.jsonl')));

  const serialized = JSON.stringify(result.events[0]);
  assert.equal(serialized.includes('/Users/alice'), false, 'must not leak a filesystem path');
  assert.equal(serialized.includes('alice'), false, 'must not leak a username');
  assert.equal(serialized.includes('do the secret thing'), false, 'must not leak prompt text');
});

// ── 6. parseLines — since cutoff drops the pre-cutoff line ──────────────────────

const BEFORE_CUTOFF_LINE = JSON.stringify({
  type: 'message_end',
  message: { usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, model: 'anthropic/claude-sonnet-4-5' },
  timestamp: '2026-01-01T00:00:00.000Z',
});

const AFTER_CUTOFF_LINE = JSON.stringify({
  type: 'message_end',
  message: { usage: { input: 2, output: 2, cacheRead: 0, cacheWrite: 0 }, model: 'anthropic/claude-haiku-4-5' },
  timestamp: '2026-06-01T00:00:00.000Z',
});

test('Given two message_end lines one before and one after the cutoff, when parseLines runs with a since cutoff, then only the later event survives', async () => {
  const since = '2026-03-01T00:00:00.000Z';
  const sut = parseLines;

  const result = await sut(asyncLines([BEFORE_CUTOFF_LINE, AFTER_CUTOFF_LINE]), since);

  assert.equal(result.events.length, 1, 'only the after-cutoff event must survive');
  assert.equal(result.events[0].model, 'anthropic/claude-haiku-4-5');
  assert.equal(result.skipped, 0, 'filtered-by-since events are not skipped');
});

test('Given a message_end line timestamped exactly at the since cutoff, when parseLines runs with that cutoff, then the event is kept (inclusive lower bound)', async () => {
  const since = '2026-01-01T00:00:00.000Z';
  const sut = parseLines;
  const line = JSON.stringify({
    type: 'message_end',
    message: { usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, model: 'anthropic/claude-sonnet-4-5' },
    timestamp: since,
  });

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1, 'a timestamp exactly at the cutoff must be kept, not dropped');
});

// ── 6b. parseLines — null-safety on non-try-guarded lines ───────────────────────

test('Given a stream containing a bare null line among valid lines, when parseLines runs, then it does not throw, emits the normal events, and skipped stays unchanged', async () => {
  const sut = parseLines;
  const lines = [
    'null',
    JSON.stringify({ type: 'session', id: 'pi-sess-null-safe' }),
    JSON.stringify({ type: 'message_end', message: { usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, model: 'anthropic/claude-sonnet-4-5' } }),
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.skipped, 0, 'a bare "null" line is valid JSON, not malformed');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].run, 'pi-sess-null-safe');
});

test('Given a message_end line with a message but no usage, when parseLines runs, then the line is skipped and no event is emitted', async () => {
  const sut = parseLines;
  const line = JSON.stringify({ type: 'message_end', message: { model: 'anthropic/claude-sonnet-4-5' } });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0);
});

test('Given a message_end line with no message key at all, when parseLines runs, then it does not throw and no event is emitted', async () => {
  const sut = parseLines;
  const line = JSON.stringify({ type: 'message_end' });

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0);
});

test("Given a session header line followed by a message_end line that also carries an id, when parseLines runs, then the held header session id is not overwritten by the later line's id", async () => {
  const sut = parseLines;
  const lines = [
    JSON.stringify({ type: 'session', id: 'pi-sess-HDR' }),
    JSON.stringify({
      type: 'message_end',
      id: 'pi-sess-WRONG',
      message: { usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, model: 'anthropic/claude-sonnet-4-5' },
    }),
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].run, 'pi-sess-HDR', 'a non-session line must never overwrite the held session id');
});

test('Given a stream with a whitespace-only line among valid lines, when parseLines runs, then it is skipped without incrementing the skipped count', async () => {
  const sut = parseLines;
  const lines = [
    JSON.stringify({ type: 'session', id: 'pi-sess-ws' }),
    '   ',
    JSON.stringify({ type: 'message_end', message: { usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, model: 'anthropic/claude-sonnet-4-5' } }),
  ];

  const result = await sut(asyncLines(lines));

  assert.equal(result.skipped, 0, 'a whitespace-only line is not malformed');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].run, 'pi-sess-ws');
});

test('Given any input stream, when parseLines runs, then markers is always an empty array (pi has no auto-skip signal text)', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-run.jsonl')));

  assert.deepEqual(result.markers, []);
});

// ── 7. report byte-match — aggregate + serializeReport reused unchanged ─────────

const FIXED_PI_EVENTS = [
  {
    run: 'pi-sess-fixed', slug: null, phase: null, role: null,
    model: 'anthropic/claude-sonnet-4-5',
    tokens: { input: 2, cacheRead: 10, cacheCreation: 5, output: 3 },
    cacheCreationTtl: null, messages: 1, durationMs: 0,
  },
];

// Independent deep-sort oracle (NOT the production sortDeep) — recursively sorts
// every object's keys so the byte assertion below genuinely pins deep-sorting.
function deepSortOracle(value) {
  if (Array.isArray(value)) {
    return value.map(deepSortOracle);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, deepSortOracle(value[k])]));
  }
  return value;
}

test('Given a fixed pi UsageEvent set, when aggregate and serializeReport run, then the output is deep-sorted 2-space-indented JSON with a single trailing newline, schema-identical to the claude path', async () => {
  const piReport = aggregate(FIXED_PI_EVENTS, {});
  const sut = serializeReport(piReport);

  const claudeEvents = (await parseClaudeLines(asyncLines(claudeFixtureLines('single-rollup.jsonl')))).events;
  const claudeReport = aggregate(claudeEvents, {});
  const claudeSerialized = serializeReport(claudeReport);

  // Byte-exact: deep-sorted keys (nested included), 2-space indent, one trailing newline.
  assert.equal(
    sut,
    JSON.stringify(deepSortOracle(piReport), null, 2) + '\n',
    'serializeReport output must be byte-identical to deep-sorted 2-space JSON with a single trailing newline',
  );
  assert.deepEqual(JSON.parse(sut), piReport, 'serialization must round-trip to the same report');
  assert.deepEqual(
    Object.keys(JSON.parse(sut)).sort(),
    Object.keys(JSON.parse(claudeSerialized)).sort(),
    'top-level keys must match the claude path schema',
  );
  assert.deepEqual(Object.keys(JSON.parse(sut)).sort(), ['recommendations', 'runs', 'schemaVersion']);
});
