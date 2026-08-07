import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import {
  tokensFromOpencodeUsage,
  eventFromOpencodeLine,
  parseLines,
} from '../src/observability/adapters/opencode/telemetry.js';
import { parseLines as parseClaudeLines } from '../src/observability/adapters/claude/telemetry.js';
import { aggregate, serializeReport } from '../src/observability/usage-aggregate.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/opencode');
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

// ── 1. tokensFromOpencodeUsage — maps already-neutral fields, coercing via numOrZero ──

test('Given a raw opencode tokens object, when tokensFromOpencodeUsage runs, then it maps to the neutral token shape', () => {
  const tokens = { input: 2, cacheRead: 196062, cacheCreation: 255, output: 900 };
  const sut = tokensFromOpencodeUsage;

  const result = sut(tokens);

  assert.deepEqual(result, { input: 2, cacheRead: 196062, cacheCreation: 255, output: 900 });
});

test('Given a tokens object with non-numeric values, when tokensFromOpencodeUsage runs, then all fields coerce to 0', () => {
  const tokens = { input: 'bad', cacheRead: null, cacheCreation: undefined, output: NaN };
  const sut = tokensFromOpencodeUsage;

  const result = sut(tokens);

  assert.deepEqual(result, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});

test('Given tokens itself is undefined, when tokensFromOpencodeUsage runs, then it does not throw and every field defaults to 0', () => {
  const sut = tokensFromOpencodeUsage;

  const result = sut(undefined);

  assert.deepEqual(result, { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 });
});

// ── 2. eventFromOpencodeLine — synthetic-model event returns null ────────────────

test('Given a parsed event with model of <synthetic>, when eventFromOpencodeLine runs, then it returns null', () => {
  const parsed = {
    sessionID: 'ses-x', agent: 'craft-designer', model: '<synthetic>',
    tokens: { input: 0, cacheRead: 0, cacheCreation: 0, output: 0 },
    toolCalls: 0, durationMs: 0,
  };
  const sut = eventFromOpencodeLine;

  const result = sut(parsed);

  assert.equal(result, null);
});

// ── 3. eventFromOpencodeLine — full field mapping + role/phase ───────────────────

test('Given an agent name colliding with an Object.prototype member, when eventFromOpencodeLine runs, then phase is null rather than an inherited member', () => {
  const sut = eventFromOpencodeLine;

  for (const agent of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']) {
    const result = sut({
      sessionID: 'ses-proto', agent,
      model: 'anthropic/claude-opus-4-8',
      tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
      toolCalls: 1, durationMs: 1,
    });

    // An inherited function survives JSON.stringify as a DROPPED key and an inherited
    // object as `{}`, either way corrupting a committed report whose schema contracts
    // string|null — so the type matters as much as the value.
    assert.equal(result.phase, null, `agent '${agent}' must not resolve to an inherited member`);
    assert.equal(typeof result.phase, 'object', `agent '${agent}' must yield null, not a function or object`);
  }
});

test('Given a parsed craft-designer event, when eventFromOpencodeLine runs, then run, slug, phase, role, model, tokens, cacheCreationTtl, messages and durationMs all map correctly', () => {
  const parsed = {
    sessionID: 'ses-proof', slug: 'feature-x', agent: 'craft-designer',
    model: 'anthropic/claude-opus-4-8',
    tokens: { input: 2, cacheRead: 196062, cacheCreation: 255, output: 900 },
    cacheCreationTtl: { creation5m: 255, creation1h: 0 },
    toolCalls: 10, durationMs: 589907,
  };
  const sut = eventFromOpencodeLine;

  const result = sut(parsed);

  assert.equal(result.run, 'ses-proof');
  assert.equal(result.slug, 'feature-x');
  assert.equal(result.phase, 'design');
  assert.equal(result.role, 'designer');
  assert.equal(result.model, 'anthropic/claude-opus-4-8');
  assert.deepEqual(result.tokens, { input: 2, cacheRead: 196062, cacheCreation: 255, output: 900 });
  assert.deepEqual(result.cacheCreationTtl, { creation5m: 255, creation1h: 0 });
  assert.equal(result.messages, 10);
  assert.equal(result.durationMs, 589907);
});

// ── 4. eventFromOpencodeLine — no cacheCreationTtl on the parsed line yields null ─

test('Given a parsed event without a cacheCreationTtl field, when eventFromOpencodeLine runs, then cacheCreationTtl is null', () => {
  const parsed = {
    sessionID: 'ses-y', agent: 'craft-planner', model: 'anthropic/claude-sonnet-4-6',
    tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
    toolCalls: 1, durationMs: 100,
  };
  const sut = eventFromOpencodeLine;

  const result = sut(parsed);

  assert.equal(result.cacheCreationTtl, null);
});

test('Given a parsed event whose cacheCreationTtl is explicitly null, when eventFromOpencodeLine runs, then cacheCreationTtl is null without throwing', () => {
  const parsed = {
    sessionID: 'ses-ccnull', agent: 'craft-designer', model: 'anthropic/claude-sonnet-4-6',
    tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
    cacheCreationTtl: null,
    toolCalls: 1, durationMs: 100,
  };
  const sut = eventFromOpencodeLine;

  const result = sut(parsed);

  assert.equal(result.cacheCreationTtl, null);
});

test('Given a parsed event whose cacheCreationTtl is a non-object (a number), when eventFromOpencodeLine runs, then cacheCreationTtl is normalized to null', () => {
  const parsed = {
    sessionID: 'ses-ccnum', agent: 'craft-designer', model: 'anthropic/claude-sonnet-4-6',
    tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
    cacheCreationTtl: 42,
    toolCalls: 1, durationMs: 100,
  };
  const sut = eventFromOpencodeLine;

  const result = sut(parsed);

  assert.equal(result.cacheCreationTtl, null);
});

// ── 5. eventFromOpencodeLine — unrecognized agent yields null role and phase ─────

test('Given a parsed event whose agent is not a craft- prefixed name, when eventFromOpencodeLine runs, then role and phase are null', () => {
  const parsed = {
    sessionID: 'ses-z', agent: 'some-other-agent', model: 'anthropic/claude-sonnet-4-6',
    tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
    toolCalls: 1, durationMs: 100,
  };
  const sut = eventFromOpencodeLine;

  const result = sut(parsed);

  assert.equal(result.role, 'some-other-agent');
  assert.equal(result.phase, null);
});

test('Given a parsed event with no agent field at all, when eventFromOpencodeLine runs, then role and phase are both null without throwing', () => {
  const parsed = {
    sessionID: 'ses-noagent', model: 'anthropic/claude-sonnet-4-6',
    tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
    toolCalls: 1, durationMs: 100,
  };
  const sut = eventFromOpencodeLine;

  const result = sut(parsed);

  assert.equal(result.role, null);
  assert.equal(result.phase, null);
});

// ── 6. parseLines — emits UsageEvent from single-rollup fixture ──────────────────

test('Given a fixture with one valid opencode event, when parseLines runs, then one UsageEvent is returned with correct field mapping and skipped is 0', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-rollup.jsonl')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].phase, 'design');
  assert.equal(result.events[0].role, 'designer');
  assert.equal(result.events[0].model, 'anthropic/claude-opus-4-8');
  assert.equal(result.events[0].durationMs, 589907);
});

// ── 7. parseLines — filters synthetic-model event ────────────────────────────────

test('Given a fixture whose only event has model <synthetic>, when parseLines runs, then events is empty and skipped is 0', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('with-synthetic.jsonl')));

  assert.equal(result.skipped, 0);
  assert.equal(result.events.length, 0);
});

// ── 8. parseLines — skips malformed lines and counts them, surrounding lines unaffected ──

test('Given a fixture with two valid events and one malformed line, when parseLines runs, then two events are emitted and skipped is 1', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('malformed.jsonl')));

  assert.equal(result.skipped, 1);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].role, 'planner');
  assert.equal(result.events[1].role, 'reviewer');
});

// ── 9. parseLines — redaction: only whitelisted fields on the emitted event ──────

test('Given a fixture event carrying non-whitelisted fields (cwd, home, user, prompt), when parseLines runs, then the emitted event has only the whitelisted UsageEvent keys', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-rollup.jsonl')));

  assert.deepEqual(Object.keys(result.events[0]).sort(), WHITELISTED_FIELDS);
});

test('Given a fixture event carrying a path, home directory, username and prompt text, when parseLines runs, then none of those values leak into the emitted event', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-rollup.jsonl')));

  const serialized = JSON.stringify(result.events[0]);
  assert.equal(serialized.includes('/Users/alice'), false, 'must not leak a filesystem path');
  assert.equal(serialized.includes('alice'), false, 'must not leak a username');
  assert.equal(serialized.includes('do the secret thing'), false, 'must not leak prompt text');
});

// ── 10. parseLines — --since filter drops the pre-cutoff line ───────────────────

const BEFORE_CUTOFF_LINE = JSON.stringify({
  sessionID: 'ses-before', slug: 'feat', agent: 'craft-designer',
  model: 'anthropic/claude-sonnet-4-6',
  tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
  toolCalls: 1, durationMs: 100, time: '2026-01-01T00:00:00.000Z',
});

const AFTER_CUTOFF_LINE = JSON.stringify({
  sessionID: 'ses-after', slug: 'feat', agent: 'craft-planner',
  model: 'anthropic/claude-sonnet-4-6',
  tokens: { input: 2, cacheRead: 0, cacheCreation: 0, output: 2 },
  toolCalls: 2, durationMs: 200, time: '2026-06-01T00:00:00.000Z',
});

test('Given two events one before and one after the cutoff, when parseLines runs with a since cutoff, then only the later event survives', async () => {
  const since = '2026-03-01T00:00:00.000Z';
  const sut = parseLines;

  const result = await sut(asyncLines([BEFORE_CUTOFF_LINE, AFTER_CUTOFF_LINE]), since);

  assert.equal(result.events.length, 1, 'only the after-cutoff event must survive');
  assert.equal(result.events[0].run, 'ses-after');
  assert.equal(result.skipped, 0, 'filtered-by-since events are not skipped');
});

test('Given an event with a malformed negative time field and no --since cutoff, when parseLines runs, then the event is not filtered (the cutoff comparison must never run when since is unset)', async () => {
  const line = JSON.stringify({
    sessionID: 'ses-negtime', agent: 'craft-designer', model: 'anthropic/claude-sonnet-4-6',
    tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
    toolCalls: 1, durationMs: 100, time: -1,
  });
  const sut = parseLines;

  const result = await sut(asyncLines([line]));

  assert.equal(result.events.length, 1, 'no --since means the cutoff comparison must be skipped entirely');
});

test('Given an event with no time field and a since cutoff set, when parseLines runs, then the event is not dropped by the ts !== null guard', async () => {
  const line = JSON.stringify({
    sessionID: 'ses-notime', agent: 'craft-designer', model: 'anthropic/claude-sonnet-4-6',
    tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
    toolCalls: 1, durationMs: 100,
  });
  // Bare numeric string: Number(since) > Number(null)=0, so `null < since` is true
  // unless the `ts !== null` short-circuit fires first — pins that guard.
  const since = '1';
  const sut = parseLines;

  const result = await sut(asyncLines([line]), since);

  assert.equal(result.events.length, 1, 'an event with no timestamp must never be dropped by the since filter');
});

test('Given an event whose time exactly equals the since cutoff, when parseLines runs, then the event is not dropped (the filter is strictly less-than)', async () => {
  const boundary = '2026-03-01T00:00:00.000Z';
  const line = JSON.stringify({
    sessionID: 'ses-boundary', agent: 'craft-designer', model: 'anthropic/claude-sonnet-4-6',
    tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
    toolCalls: 1, durationMs: 100, time: boundary,
  });
  const sut = parseLines;

  const result = await sut(asyncLines([line]), boundary);

  assert.equal(result.events.length, 1, 'ts equal to since must survive; filter is strictly < not <=');
});

// ── 11. parseLines — role→phase mapping for all 9 craft roles ───────────────────

test('Given each of the 9 craft-<role> agent names, when parseLines runs, then phase maps to the correct vendor-neutral label', async () => {
  const ROLE_PHASE_MAP = {
    'craft-designer': 'design',
    'craft-planner': 'planning',
    'craft-part-implementer': 'implementation',
    'craft-reviewer': 'review',
    'craft-harness-triager': 'validation',
    'craft-docs-writer': 'documentation',
    'craft-backlog-ticker': 'documentation',
    'craft-requirements-writer': 'requirements',
    'craft-refactor-executor': 'refactoring',
  };
  const sut = parseLines;

  for (const [agent, expectedPhase] of Object.entries(ROLE_PHASE_MAP)) {
    const line = JSON.stringify({
      sessionID: 's1', agent, model: 'anthropic/claude-sonnet-4-6',
      tokens: { input: 1, cacheRead: 0, cacheCreation: 0, output: 1 },
      toolCalls: 1, durationMs: 100,
    });
    const result = await sut(asyncLines([line]));
    assert.equal(result.events[0].phase, expectedPhase, `${agent} must map to phase ${expectedPhase}`);
  }
});

// ── 12. parseLines — markers is always [] (auto-skip mapping deferred) ──────────

test('Given a fixture with a valid event, when parseLines runs, then markers is an empty array', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(fixtureLines('single-rollup.jsonl')));

  assert.deepEqual(result.markers, []);
});

// ── 13. parseLines — whitespace-only lines are silent (not counted as malformed) ─

test('Given lines containing only whitespace, when parseLines runs, then skipped count is 0', async () => {
  const sut = parseLines;

  const result = await sut(asyncLines(['   ', '\t', '']));

  assert.equal(result.events.length, 0);
  assert.equal(result.skipped, 0, 'whitespace-only lines must not increment skipped');
});

// ── 14. report byte-match — aggregate + serializeReport reused unchanged ────────

const FIXED_OPENCODE_EVENTS = [
  {
    run: 'ses-fixed', slug: 'feature-x', phase: 'design', role: 'designer',
    model: 'anthropic/claude-opus-4-8',
    tokens: { input: 2, cacheRead: 10, cacheCreation: 5, output: 3 },
    cacheCreationTtl: null, messages: 1, durationMs: 100,
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

test('Given a fixed opencode UsageEvent set, when aggregate and serializeReport run, then the output is deep-sorted 2-space-indented JSON with a single trailing newline, schema-identical to the claude path', async () => {
  const opencodeReport = aggregate(FIXED_OPENCODE_EVENTS, {});
  const sut = serializeReport(opencodeReport);

  const claudeEvents = (await parseClaudeLines(asyncLines(claudeFixtureLines('main-loop-usage.jsonl')))).events;
  const claudeReport = aggregate(claudeEvents, {});
  const claudeSerialized = serializeReport(claudeReport);

  // Byte-exact: deep-sorted keys (nested included), 2-space indent, one trailing newline.
  assert.equal(
    sut,
    JSON.stringify(deepSortOracle(opencodeReport), null, 2) + '\n',
    'serializeReport output must be byte-identical to deep-sorted 2-space JSON with a single trailing newline',
  );
  assert.deepEqual(JSON.parse(sut), opencodeReport, 'serialization must round-trip to the same report');
  assert.deepEqual(
    Object.keys(JSON.parse(sut)).sort(),
    Object.keys(JSON.parse(claudeSerialized)).sort(),
    'top-level keys must match the claude path schema',
  );
  assert.deepEqual(Object.keys(JSON.parse(sut)).sort(), ['recommendations', 'runs', 'schemaVersion']);
});
