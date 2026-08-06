import { test } from 'node:test';
import assert from 'node:assert/strict';

import { discover } from '../src/observability/adapters/claude/discovery.js';

// Builds fake listDir/readText ports from plain object maps — zero filesystem.
function makePorts({ dirs = {}, files = {} } = {}) {
  return {
    listDir: (relPath) => (Object.prototype.hasOwnProperty.call(dirs, relPath) ? dirs[relPath] : null),
    readText: (relPath) => (Object.prototype.hasOwnProperty.call(files, relPath) ? files[relPath] : null),
  };
}

// ── 1. the pinned two-level shape ──────────────────────────────────────────

test('Given a root with a main transcript and a session with one sub-agent transcript, when discover runs, then it returns one main entry and one sub-agent entry with the right relPath and context', () => {
  const ports = makePorts({
    dirs: {
      '': ['main-a.jsonl', 'sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl', 'agent-1.meta.json'],
    },
    files: {
      'sess-a/subagents/agent-1.meta.json': '{"agentType":"craft:reviewer"}',
    },
  });
  const sut = discover;

  const result = sut(ports);

  assert.deepEqual(result.entries, [
    { relPath: 'main-a.jsonl', context: { sourceKind: 'main' } },
    {
      relPath: 'sess-a/subagents/agent-1.jsonl',
      context: { sourceKind: 'subagent', agentType: 'craft:reviewer' },
    },
  ]);
  assert.equal(result.unreadable, 0);
});

// ── 2. a non-session directory (memory/-style) is refused by shape ────────

test('Given a root-level directory whose listing contains no subagents child, when discover runs, then it yields no entries and is not counted as unreadable', () => {
  const ports = makePorts({
    dirs: {
      '': ['memory'],
      memory: ['notes.json', 'index.md'],
    },
  });
  const sut = discover;

  const result = sut(ports);

  assert.deepEqual(result.entries, []);
  assert.equal(result.unreadable, 0);
});

// ── 3. a session dir with no subagents/ child yields main-loop entries only ─

test('Given a root with a main transcript and a session directory that never grew a subagents child, when discover runs, then only the main-loop entry is returned', () => {
  const ports = makePorts({
    dirs: {
      '': ['main-a.jsonl', 'sess-a'],
      'sess-a': ['some-other-file.txt'],
    },
  });
  const sut = discover;

  const result = sut(ports);

  assert.deepEqual(result.entries, [{ relPath: 'main-a.jsonl', context: { sourceKind: 'main' } }]);
  assert.equal(result.unreadable, 0);
});

// ── 4. an empty subagents/ directory contributes nothing, uncounted ───────

test('Given a session whose subagents directory lists as empty, when discover runs, then it yields no sub-agent entries and is not counted as unreadable', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': [],
    },
  });
  const sut = discover;

  const result = sut(ports);

  assert.deepEqual(result.entries, []);
  assert.equal(result.unreadable, 0);
});

// ── 5. an unlistable subagents/ directory is counted, never followed ──────

test('Given a session whose subagents child was named in the parent listing but cannot itself be listed, when discover runs, then it yields no entries for that session and unreadable is 1', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      // 'sess-a/subagents' intentionally absent from dirs → listDir returns null
    },
  });
  const sut = discover;

  const result = sut(ports);

  assert.deepEqual(result.entries, []);
  assert.equal(result.unreadable, 1);
});

// ── 6. the sidecar itself is never returned as a transcript entry ─────────

test('Given a subagents directory holding a transcript and its meta.json sidecar, when discover runs, then the sidecar file never appears among the entries', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl', 'agent-1.meta.json'],
    },
    files: { 'sess-a/subagents/agent-1.meta.json': '{"agentType":"craft:reviewer"}' },
  });
  const sut = discover;

  const result = sut(ports);

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].relPath, 'sess-a/subagents/agent-1.jsonl');
});

// ── 7. a .jsonl directly under a session dir (not under subagents/) is refused ─

test('Given a session directory holding a stray .jsonl file alongside its subagents child, when discover runs, then the stray file is not accepted as an entry', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents', 'stray.jsonl'],
      'sess-a/subagents': [],
    },
  });
  const sut = discover;

  const result = sut(ports);

  assert.deepEqual(result.entries, []);
});

// ── 8. depth-2 flat siblings are returned like any other sub-agent entry ──

test('Given a subagents directory holding two flat sibling transcripts, when discover runs, then both are returned as sub-agent entries', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl', 'agent-2.jsonl'],
    },
    files: {
      'sess-a/subagents/agent-1.meta.json': '{"agentType":"craft:designer"}',
      'sess-a/subagents/agent-2.meta.json': '{"agentType":"craft:reviewer"}',
    },
  });
  const sut = discover;

  const result = sut(ports);

  assert.deepEqual(
    result.entries.map((e) => e.relPath),
    ['sess-a/subagents/agent-1.jsonl', 'sess-a/subagents/agent-2.jsonl'],
  );
});

// ── 8b. a subagents sibling missing the agent- prefix is refused by shape ──

test('Given a subagents directory holding two agent- transcripts and a third .jsonl lacking the prefix, when discover runs, then only the two agent-*.jsonl entries are returned', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl', 'agent-2.jsonl', 'notes.jsonl'],
    },
    files: {
      'sess-a/subagents/agent-1.meta.json': '{"agentType":"craft:designer"}',
      'sess-a/subagents/agent-2.meta.json': '{"agentType":"craft:reviewer"}',
    },
  });
  const sut = discover;

  const result = sut(ports);

  assert.deepEqual(
    result.entries.map((e) => e.relPath),
    ['sess-a/subagents/agent-1.jsonl', 'sess-a/subagents/agent-2.jsonl'],
  );
});

// ── 9. a transcript with no sidecar still yields an entry, unlabelled ──────

test('Given a sub-agent transcript with no sidecar file, when discover runs, then the entry is still returned with agentType null', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl'],
    },
  });
  const sut = discover;

  const result = sut(ports);

  assert.equal(result.entries[0].context.agentType, null);
});

// ── 10. a malformed sidecar does not throw and yields agentType null ──────

test('Given a sub-agent transcript whose sidecar is not valid JSON, when discover runs, then it does not throw and yields agentType null', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl'],
    },
    files: { 'sess-a/subagents/agent-1.meta.json': 'not json' },
  });
  const sut = discover;

  const result = sut(ports);

  assert.equal(result.entries[0].context.agentType, null);
});

// ── 11. a sidecar with no agentType field yields agentType null ───────────

test('Given a sub-agent transcript whose sidecar is valid JSON but carries no agentType, when discover runs, then it yields agentType null', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl'],
    },
    files: { 'sess-a/subagents/agent-1.meta.json': '{"description":"Review: tests dimension"}' },
  });
  const sut = discover;

  const result = sut(ports);

  assert.equal(result.entries[0].context.agentType, null);
});

// ── 11b. a sidecar agentType shaped as a prototype-pollution key is rejected ──

test('Given a sub-agent transcript whose sidecar carries agentType "__proto__", when discover runs, then it yields agentType null — the same outcome as a missing sidecar', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl'],
    },
    files: { 'sess-a/subagents/agent-1.meta.json': '{"agentType":"__proto__"}' },
  });
  const sut = discover;

  const result = sut(ports);

  assert.equal(result.entries[0].context.agentType, null, 'a prototype-pollution-shaped agentType must be rejected, not passed through');
});

// ── 11c. an out-of-bounds-length sidecar agentType is rejected ────────

test('Given a sub-agent transcript whose sidecar carries an agentType longer than the bounded identifier pattern allows, when discover runs, then it yields agentType null', () => {
  const overlong = 'a'.repeat(65);
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl'],
    },
    files: { 'sess-a/subagents/agent-1.meta.json': JSON.stringify({ agentType: overlong }) },
  });
  const sut = discover;

  const result = sut(ports);

  assert.equal(result.entries[0].context.agentType, null, 'an over-length agentType must be rejected by the bounded identifier pattern');
});

// ── 11d. a capitalised stock agent type (e.g. "Explore") survives as a label ──

test('Given a sub-agent transcript whose sidecar carries agentType "Explore" (a capitalised stock Claude Code agent type), when discover runs, then it survives as the agentType label instead of being rejected', () => {
  const ports = makePorts({
    dirs: {
      '': ['sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl'],
    },
    files: { 'sess-a/subagents/agent-1.meta.json': '{"agentType":"Explore"}' },
  });
  const sut = discover;

  const result = sut(ports);

  assert.equal(result.entries[0].context.agentType, 'Explore', 'a capitalised stock agent type must survive, not be treated as a missing sidecar');
});

// ── 12. an unlistable root yields zero entries and does not throw ─────────

test('Given a root that cannot be listed at all, when discover runs, then it yields zero entries and does not throw', () => {
  const ports = makePorts({ dirs: {} });
  const sut = discover;

  const result = sut(ports);

  assert.deepEqual(result, { entries: [], unreadable: 0 });
});

// ── 13. output ordering is deterministic regardless of input listing order ─

test('Given the same fake tree fed with shuffled listing order, when discover runs twice, then the entry arrays are byte-identical', () => {
  const inOrder = makePorts({
    dirs: {
      '': ['main-a.jsonl', 'sess-a', 'sess-b'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-1.jsonl', 'agent-2.jsonl'],
      'sess-b': ['subagents'],
      'sess-b/subagents': ['agent-1.jsonl'],
    },
    files: {
      'sess-a/subagents/agent-1.meta.json': '{"agentType":"craft:designer"}',
      'sess-a/subagents/agent-2.meta.json': '{"agentType":"craft:reviewer"}',
      'sess-b/subagents/agent-1.meta.json': '{"agentType":"craft:planner"}',
    },
  });
  const shuffled = makePorts({
    dirs: {
      '': ['sess-b', 'main-a.jsonl', 'sess-a'],
      'sess-a': ['subagents'],
      'sess-a/subagents': ['agent-2.jsonl', 'agent-1.jsonl'],
      'sess-b': ['subagents'],
      'sess-b/subagents': ['agent-1.jsonl'],
    },
    files: {
      'sess-a/subagents/agent-1.meta.json': '{"agentType":"craft:designer"}',
      'sess-a/subagents/agent-2.meta.json': '{"agentType":"craft:reviewer"}',
      'sess-b/subagents/agent-1.meta.json': '{"agentType":"craft:planner"}',
    },
  });
  const sut = discover;

  const resultInOrder = sut(inOrder);
  const resultShuffled = sut(shuffled);

  assert.deepEqual(resultShuffled.entries, resultInOrder.entries);
});
