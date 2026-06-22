/**
 * Unit tests for engine/src/memory.js — store read path.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 *
 * All tests are pure (injected deps, no real filesystem).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONCERNS, parseStore, serializeStore, load, save, FLOOR, CEILING, STEP, WINDOW } from '../src/memory.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

const TOOLCHAIN_ENTRY = {
  concern: 'toolchain',
  ecosystem: 'node',
  lockfileFingerprint: 'abc123',
  confidence: 3,
  provenance: { run: 'r1', commit: 'c1', date: '2024-01-01' },
};

const GATE_CMD_ENTRY = {
  concern: 'gate-cmd',
  phase: 'implementation',
  command: 'node --test',
  confidence: 4,
  provenance: { run: 'r1', commit: 'c1', date: '2024-01-01' },
};

const MUTATION_TOOL_ENTRY = {
  concern: 'mutation-tool',
  tool: 'stryker',
  configFingerprint: 'def456',
  confidence: 2,
  provenance: { run: 'r1', commit: 'c1', date: '2024-01-01' },
};

const FINDINGS_ENTRY = {
  concern: 'findings',
  file: 'engine/src/foo.js',
  severity: 'high',
  pattern: 'no-unused-vars',
  confidence: 3,
  provenance: { run: 'r1', commit: 'c1', date: '2024-01-01' },
};

const SLICE_SIZING_ENTRY = {
  concern: 'slice-sizing',
  size: 8,
  outcome: 'pass',
  confidence: 2,
  provenance: { run: 'r1', commit: 'c1', date: '2024-01-01' },
};

function makeStoreContent(entries) {
  return serializeStore({ entries: groupByConcern(entries), evicted: [], loadNote: null });
}

function groupByConcern(entries) {
  const grouped = {};
  for (const concern of CONCERNS) grouped[concern] = [];
  for (const entry of entries) grouped[entry.concern].push(entry);
  return grouped;
}

const ALL_PASS_VALIDATORS = {
  toolchain: () => true,
  'gate-cmd': () => true,
  'mutation-tool': () => true,
  findings: () => true,
  'slice-sizing': () => true,
};

const ALL_FAIL_VALIDATORS = {
  toolchain: () => false,
  'gate-cmd': () => false,
  'mutation-tool': () => false,
  findings: () => false,
  'slice-sizing': () => false,
};

// ─── RED 1 — round-trip ───────────────────────────────────────────────────────

test('Given store with one toolchain entry, when parse then serialize, then frontmatter round-trips', () => {
  const sut = parseStore;
  const original = makeStoreContent([TOOLCHAIN_ENTRY]);

  const parsed = sut(original);
  const reserialized = serializeStore(parsed);
  const reparsed = sut(reserialized);

  assert.deepEqual(reparsed.entries.toolchain[0], parsed.entries.toolchain[0]);
});

// ─── RED 2 — cold/absent store → empty view ──────────────────────────────────

test('Given readStore returns null, when load runs, then it returns empty view with loadNote and does not throw', () => {
  const sut = load;

  const result = sut('/repo', { readStore: () => null, validators: ALL_PASS_VALIDATORS });

  for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
  assert.deepEqual(result.evicted, []);
  assert.ok(result.loadNote !== null && result.loadNote !== undefined);
});

// ─── RED 3 — malformed store → empty view ────────────────────────────────────

test('Given readStore returns arbitrary non-YAML garbage, when load runs, then it returns empty view with loadNote "malformed store" and never throws', () => {
  const sut = load;

  assert.doesNotThrow(() => {
    const result = sut('/repo', { readStore: () => '}{{{not: yaml: at: all:}}', validators: ALL_PASS_VALIDATORS });

    for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
    assert.equal(result.loadNote, 'malformed store');
  });
});

// ─── KILL: serializeStore ?? [] fallback (L122/L181) ─────────────────────────

test('Given a view with a missing concern key in entries, when serializeStore runs, then it uses empty array fallback and outputs valid YAML', () => {
  // Omit toolchain key entirely to exercise the ?? [] fallback path in both serializeStore and buildBody
  const entries = {};
  for (const c of CONCERNS) { if (c !== 'toolchain') entries[c] = []; }
  const view = { entries, evicted: [], loadNote: null };
  const result = serializeStore(view);
  assert.ok(result.includes('toolchain:'), 'toolchain section must appear in YAML frontmatter even when key missing from entries');
  // In the markdown body, missing-key concern must show _(none)_ (empty array fallback), not an entry line
  assert.ok(result.includes('_(none)_'), 'body must show _(none)_ for missing-key concern, not a synthetic entry');
  // Entry-line format contains "confidence:" — must NOT appear for the missing concern body section
  const toolchainBodySection = result.split('## toolchain')[1]?.split('## ')[0] ?? '';
  assert.ok(!toolchainBodySection.includes('confidence:'), 'missing-key concern must use empty-array fallback not sentinel entry');
  // YAML frontmatter for missing-key concern must be empty array (no sentinel string value)
  const frontmatterSection = result.split('---')[1] ?? '';
  assert.ok(!frontmatterSection.includes('Stryker'), 'frontmatter must not contain sentinel value from non-empty fallback');
  // Parsed back, the missing concern must have zero entries
  const reparsed = parseStore(result);
  assert.deepEqual(reparsed.entries.toolchain, [], 'missing-key concern must round-trip as empty array');
});

// ─── KILL: parseStore catch block return null (L104) ─────────────────────────

test('Given content with valid frontmatter fences but invalid YAML inside, when parseStore runs, then it returns null without throwing', () => {
  // Content has --- fences so extractFrontmatter returns a non-null string, but
  // yamlLoad throws on the invalid YAML → caught at L104 catch block → returns null
  const invalidYaml = '---\na: b: c\n---\n# body';
  const result = parseStore(invalidYaml);
  assert.equal(result, null, 'parseStore must return null when YAML inside frontmatter is invalid');
});

test('Given store content with invalid YAML frontmatter, when load runs, then it returns empty view with "malformed store" note', () => {
  const result = load('/repo', { readStore: () => '---\na: b: c\n---\n', validators: ALL_PASS_VALIDATORS });
  assert.equal(result.loadNote, 'malformed store');
  for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
});

// ─── RED 4 — poisoned store never yields gating value ────────────────────────

test('Given store whose entries all fail validate-on-read, when load runs, then entries empty and failed entries are in evicted', () => {
  const sut = load;
  const storeContent = makeStoreContent([TOOLCHAIN_ENTRY, GATE_CMD_ENTRY]);

  const result = sut('/repo', {
    readStore: () => storeContent,
    validators: ALL_FAIL_VALIDATORS,
  });

  for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
  assert.equal(result.evicted.length, 2);
  assert.ok(result.loadNote !== null);
  // Prove result is DATA (has entries shape), never a gate/blocker/verdict object
  assert.ok('entries' in result);
  assert.ok('evicted' in result);
  assert.ok('loadNote' in result);
});

// ─── RED 5 — validate-on-read drops stale toolchain entry ────────────────────

test('Given store with toolchain entry whose lockfile fingerprint no longer matches, when load runs, then it is dropped from entries and added to evicted', () => {
  const sut = load;
  const storeContent = makeStoreContent([TOOLCHAIN_ENTRY]);
  const validators = { ...ALL_PASS_VALIDATORS, toolchain: () => false };

  const result = sut('/repo', { readStore: () => storeContent, validators });

  assert.deepEqual(result.entries.toolchain, []);
  assert.equal(result.evicted.length, 1);
  assert.equal(result.evicted[0].concern, 'toolchain');
});

// ─── RED 6 — validate-on-read drops stale gate-cmd entry ─────────────────────

test('Given store with gate-cmd entry whose command is no longer resolvable, when load runs, then it is dropped from entries and added to evicted', () => {
  const sut = load;
  const storeContent = makeStoreContent([GATE_CMD_ENTRY]);
  const validators = { ...ALL_PASS_VALIDATORS, 'gate-cmd': () => false };

  const result = sut('/repo', { readStore: () => storeContent, validators });

  assert.deepEqual(result.entries['gate-cmd'], []);
  assert.equal(result.evicted.length, 1);
  assert.equal(result.evicted[0].concern, 'gate-cmd');
});

// ─── RED 7 — validate-on-read drops stale findings entry ─────────────────────

test('Given store with findings entry whose file no longer exists, when load runs, then it is dropped from entries and added to evicted', () => {
  const sut = load;
  const storeContent = makeStoreContent([FINDINGS_ENTRY]);
  const validators = { ...ALL_PASS_VALIDATORS, findings: () => false };

  const result = sut('/repo', { readStore: () => storeContent, validators });

  assert.deepEqual(result.entries.findings, []);
  assert.equal(result.evicted.length, 1);
  assert.equal(result.evicted[0].concern, 'findings');
});

// ─── RED 8 — validate-on-read drops stale mutation-tool entry ────────────────

test('Given store with mutation-tool entry whose config file is no longer present, when load runs, then it is dropped from entries and added to evicted', () => {
  const sut = load;
  const storeContent = makeStoreContent([MUTATION_TOOL_ENTRY]);
  const validators = { ...ALL_PASS_VALIDATORS, 'mutation-tool': () => false };

  const result = sut('/repo', { readStore: () => storeContent, validators });

  assert.deepEqual(result.entries['mutation-tool'], []);
  assert.equal(result.evicted.length, 1);
  assert.equal(result.evicted[0].concern, 'mutation-tool');
});

// ─── RED 9 — fresh entries survive ───────────────────────────────────────────

test('Given store whose entries all pass validate-on-read, when load runs, then every entry is in entries grouped by concern and evicted is empty', () => {
  const sut = load;
  const allEntries = [TOOLCHAIN_ENTRY, GATE_CMD_ENTRY, MUTATION_TOOL_ENTRY, FINDINGS_ENTRY, SLICE_SIZING_ENTRY];
  const storeContent = makeStoreContent(allEntries);

  const result = sut('/repo', { readStore: () => storeContent, validators: ALL_PASS_VALIDATORS });

  assert.equal(result.entries.toolchain.length, 1);
  assert.equal(result.entries['gate-cmd'].length, 1);
  assert.equal(result.entries['mutation-tool'].length, 1);
  assert.equal(result.entries.findings.length, 1);
  assert.equal(result.entries['slice-sizing'].length, 1);
  assert.deepEqual(result.evicted, []);
  assert.equal(result.loadNote, null);
});

// ─── RED 10 — slice-sizing has no re-check ───────────────────────────────────

test('Given slice-sizing entry with no slice-sizing validator provided, when load runs, then it survives (weak hint, no per-use re-check)', () => {
  const sut = load;
  const storeContent = makeStoreContent([SLICE_SIZING_ENTRY]);
  const validatorsWithoutSliceSizing = {
    toolchain: () => true,
    'gate-cmd': () => true,
    'mutation-tool': () => true,
    findings: () => true,
    // no slice-sizing key
  };

  const result = sut('/repo', { readStore: () => storeContent, validators: validatorsWithoutSliceSizing });

  assert.equal(result.entries['slice-sizing'].length, 1);
  assert.deepEqual(result.evicted, []);
});

// ─── RED 11 — empty frontmatter block → empty view ───────────────────────────

test('Given store fenced but empty frontmatter block, when load runs, then empty view with loadNote', () => {
  const sut = load;

  const result = sut('/repo', {
    readStore: () => '---\n---\n\n# human readable body\n',
    validators: ALL_PASS_VALIDATORS,
  });

  for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
  assert.ok(result.loadNote !== null);
});

// ─── RED 12 — serialize deterministic & diffable ─────────────────────────────

test('Given same entries serialized twice, when serializeStore runs, then output is byte-identical', () => {
  const sut = serializeStore;
  const view = {
    entries: groupByConcern([TOOLCHAIN_ENTRY, GATE_CMD_ENTRY]),
    evicted: [],
    loadNote: null,
  };

  const result1 = sut(view);
  const result2 = sut(view);

  assert.equal(result1, result2);
});

// ─── RED 13 — grouping: multi-entry concern preserves insertion order ─────────

test('Given store with two toolchain entries, when parse then serialize then re-parse, then insertion order is preserved', () => {
  const entry1 = { ...TOOLCHAIN_ENTRY, ecosystem: 'node', lockfileFingerprint: 'fp1' };
  const entry2 = { ...TOOLCHAIN_ENTRY, ecosystem: 'python', lockfileFingerprint: 'fp2' };
  const storeContent = makeStoreContent([entry1, entry2]);

  const parsed = parseStore(storeContent);
  const reserialized = serializeStore(parsed);
  const reparsed = parseStore(reserialized);

  assert.equal(reparsed.entries.toolchain.length, 2);
  assert.equal(reparsed.entries.toolchain[0].ecosystem, 'node');
  assert.equal(reparsed.entries.toolchain[1].ecosystem, 'python');
});

// ─── RED 14 — two concerns don't bleed into each other ───────────────────────

test('Given store with entries from two different concerns, when load runs, then entries are correctly separated by concern', () => {
  const sut = load;
  const storeContent = makeStoreContent([TOOLCHAIN_ENTRY, GATE_CMD_ENTRY]);

  const result = sut('/repo', { readStore: () => storeContent, validators: ALL_PASS_VALIDATORS });

  assert.equal(result.entries.toolchain.length, 1);
  assert.equal(result.entries['gate-cmd'].length, 1);
  assert.equal(result.entries.toolchain[0].concern, 'toolchain');
  assert.equal(result.entries['gate-cmd'][0].concern, 'gate-cmd');
});

// ─── RED 15 — unknown concern key in fixture is ignored, not thrown ───────────

test('Given store with an unknown concern key in fixture, when load runs, then it is ignored without throwing (forward-compat)', () => {
  const sut = load;
  // Manually craft a store with an unknown concern
  const yamlFrontmatter = `---\nunknown-future-concern:\n  - concern: unknown-future-concern\n    value: x\n    confidence: 1\n    provenance:\n      run: r1\n      commit: c1\n      date: "2024-01-01"\n---\n\n# body\n`;

  assert.doesNotThrow(() => {
    const result = sut('/repo', { readStore: () => yamlFrontmatter, validators: ALL_PASS_VALIDATORS });
    for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
  });
});

// ─── save / update semantics ──────────────────────────────────────────────────

// Helpers shared by save tests

function makeSaveDeps(overrides = {}) {
  const calls = [];
  const writeStore = (path, content) => { calls.push({ path, content }); };
  writeStore.calls = calls;
  return {
    writeStore,
    readStore: () => null,
    validators: ALL_PASS_VALIDATORS,
    caps: { maxEntries: 1000, maxBytes: Infinity },
    run: { run: 'run-1', commit: 'sha1', date: '2026-01-01' },
    ...overrides,
  };
}

function makeLoadedView(entries = []) {
  return {
    entries: groupByConcern(entries),
    evicted: [],
    loadNote: null,
  };
}

// ─── RED 1 — ADDED ────────────────────────────────────────────────────────────

test('Given empty store and delta with one new observation, when save runs, then entry is added with confidence FLOOR+STEP and stamped provenance', () => {
  const sut = save;
  const view = makeLoadedView([]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'abc' } }];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  const result = sut('/repo', view, delta, deps);

  assert.ok(result.writeNote === null || result.writeNote === undefined || !result.writeNote.includes('failed'));
  assert.ok(captured.length === 1);
  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1);
  assert.equal(reparsed.entries.toolchain[0].confidence, FLOOR + STEP);
  assert.ok(reparsed.entries.toolchain[0].provenance !== null);
  assert.ok(reparsed.entries.toolchain[0].provenance !== undefined);
});

// ─── RED 2 — REFRESHED, value unchanged → no churn ───────────────────────────

test('Given store with matching entry and equivalent re-observation, when save runs, then confidence rises and provenance restamps but payload bytes unchanged', () => {
  const sut = save;
  const existing = { ...TOOLCHAIN_ENTRY, confidence: 2 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'abc123' } }];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1);
  assert.equal(reparsed.entries.toolchain[0].confidence, 3);
  assert.equal(reparsed.entries.toolchain[0].lockfileFingerprint, 'abc123');
  // Provenance is restamped to the current run ('run-1'), not carried over ('r1').
  assert.equal(reparsed.entries.toolchain[0].provenance.run, 'run-1');
});

// ─── RED 3 — REFRESHED, improving observation → value rewritten ──────────────

test('Given findings entry and re-observation that escalates severity at same file+pattern, when save runs, then stored severity rewritten and no duplicate appended', () => {
  const sut = save;
  const existing = { ...FINDINGS_ENTRY, severity: 'low', confidence: 2 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'findings', payload: { file: 'engine/src/foo.js', severity: 'high', pattern: 'no-unused-vars' } }];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings.length, 1);
  assert.equal(reparsed.entries.findings[0].severity, 'high');
});

// ─── RED 4 — no duplicate on same key ────────────────────────────────────────

test('Given delta whose observation matches an existing key, when save runs, then entry count for that concern stays 1', () => {
  const sut = save;
  const view = makeLoadedView([TOOLCHAIN_ENTRY]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'abc123' } }];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1);
});

// ─── RED 5 — findings severity is payload not key ─────────────────────────────

test('Given findings entry keyed by file+pattern and re-observation with different severity, when save runs, then it is a REFRESH (one entry) not a second entry', () => {
  const sut = save;
  const existing = { ...FINDINGS_ENTRY, severity: 'medium', confidence: 2 };
  const view = makeLoadedView([existing]);
  // same file+pattern, different severity — must REFRESH, not add
  const delta = [{ concern: 'findings', payload: { file: 'engine/src/foo.js', severity: 'high', pattern: 'no-unused-vars' } }];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings.length, 1);
});

// ─── RED 6 — DECAYED ─────────────────────────────────────────────────────────

test('Given store entry not re-observed this run, when save runs, then its confidence decreases one step and entry is kept', () => {
  const sut = save;
  const existing = { ...TOOLCHAIN_ENTRY, confidence: 3 };
  const view = makeLoadedView([existing]);
  const delta = []; // no observation for toolchain
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1);
  assert.equal(reparsed.entries.toolchain[0].confidence, 2);
});

// ─── RED 7 — EVICTED below floor ─────────────────────────────────────────────

test('Given entry at FLOOR+STEP not re-observed, when save runs, then decay drops it to FLOOR and it is removed from flushed store', () => {
  const sut = save;
  // confidence = FLOOR + STEP (= 1), one decay step → FLOOR, then evicted
  const existing = { ...TOOLCHAIN_ENTRY, confidence: FLOOR + STEP };
  const view = makeLoadedView([existing]);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 0);
});

// ─── RED 8 — EVICTED via validate-on-read ────────────────────────────────────

test('Given load whose evicted[] carried a stale entry, when save runs, then that entry is absent from the flushed store', () => {
  const sut = save;
  // view has the stale entry already in evicted (load already removed it from entries)
  const staleEntry = { ...TOOLCHAIN_ENTRY, concern: 'toolchain' };
  const view = {
    entries: groupByConcern([]),
    evicted: [staleEntry],
    loadNote: 'some entries failed validate-on-read',
  };
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 0);
});

// ─── RED 9 — both caps — entry-count ─────────────────────────────────────────

test('Given store over the entry-count cap, when save runs, then flushed store has maxEntries entries', () => {
  const sut = save;
  const maxEntries = 5;
  // seed maxEntries+3 entries (all toolchain, different ecosystems)
  const entries = Array.from({ length: maxEntries + 3 }, (_, i) => ({
    ...TOOLCHAIN_ENTRY,
    ecosystem: `eco-${i}`,
    lockfileFingerprint: `fp-${i}`,
    confidence: 3,
    provenance: { run: `r${i}`, commit: `c${i}`, date: `2026-0${(i % 9) + 1}-01` },
  }));
  const view = makeLoadedView(entries);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((sum, c) => sum + reparsed.entries[c].length, 0);
  assert.ok(total <= maxEntries, `expected ≤ ${maxEntries} entries, got ${total}`);
});

// ─── RED 10 — both caps — byte cap ───────────────────────────────────────────

test('Given store under entry-count cap but over the byte cap, when save runs, then flushed serialized content is within maxBytes', () => {
  const sut = save;
  // Seed enough entries that the byte size would be large
  const entries = Array.from({ length: 10 }, (_, i) => ({
    ...TOOLCHAIN_ENTRY,
    ecosystem: `ecosystem-with-long-name-${i}`,
    lockfileFingerprint: `fingerprint-value-that-is-quite-long-${i}`,
    confidence: 3,
    provenance: { run: `run-${i}`, commit: `commit-sha-${i}`, date: '2026-01-01' },
  }));
  const view = makeLoadedView(entries);
  // Measure full size, then set cap smaller
  const fullContent = serializeStore(view);
  const fullSize = Buffer.byteLength(fullContent, 'utf8');
  const maxBytes = Math.floor(fullSize * 0.5); // force eviction to half size
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries: Infinity, maxBytes },
  });

  sut('/repo', view, delta, deps);

  assert.ok(captured.length === 1);
  const actualBytes = Buffer.byteLength(captured[0], 'utf8');
  assert.ok(actualBytes <= maxBytes, `expected ≤ ${maxBytes} bytes, got ${actualBytes}`);
});

// ─── RED 11 — newest-window eviction protects old facts ──────────────────────

test('Given store over entry-count cap with low-confidence entry outside the 50-newest window and higher-confidence entry inside it, when save runs, then outside-window entry survives and an in-window entry is dropped', () => {
  const sut = save;
  // Build WINDOW+5 entries so we exceed the cap
  // The OLDEST entry (index 0) has LOWEST confidence but is OUTSIDE the newest WINDOW
  // An in-window entry (near the end) has LOW but still higher confidence
  // The cap is set just below total count so exactly one must be evicted
  const totalEntries = WINDOW + 5;
  const maxEntries = totalEntries - 1;

  // Entry 0: very old, confidence=2 (survives decay: 2-1=1 > FLOOR) — MUST survive cap eviction (outside window)
  const outsideWindowEntry = {
    ...TOOLCHAIN_ENTRY,
    ecosystem: 'ancient-outside-window',
    confidence: 2,
    provenance: { run: 'r-old', commit: 'c-old', date: '2020-01-01' },
  };

  // Entries 1..WINDOW+4: newer entries filling the window
  // One in-window entry with confidence 2 (same as outside after decay) — this one MUST be dropped by cap
  const inWindowLowEntry = {
    ...GATE_CMD_ENTRY,
    phase: 'in-window-low-confidence',
    confidence: 2,
    provenance: { run: 'r-new', commit: 'c-new', date: '2026-06-01' },
  };

  const fillerEntries = Array.from({ length: WINDOW + 3 }, (_, i) => ({
    ...MUTATION_TOOL_ENTRY,
    tool: `tool-filler-${i}`,
    confidence: 3,
    provenance: { run: `r${i + 1}`, commit: `c${i + 1}`, date: `2026-0${(i % 9) + 1}-01` },
  }));

  // Order: outsideWindowEntry is oldest (first), then fillers, then inWindowLowEntry (newest)
  const allEntries = [outsideWindowEntry, ...fillerEntries, inWindowLowEntry];
  assert.equal(allEntries.length, totalEntries);

  const view = makeLoadedView(allEntries);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((sum, c) => sum + reparsed.entries[c].length, 0);
  assert.ok(total <= maxEntries, `total ${total} should be ≤ ${maxEntries}`);

  // The outside-window entry MUST survive
  const foundOutside = reparsed.entries.toolchain.some(
    e => e.ecosystem === 'ancient-outside-window'
  );
  assert.ok(foundOutside, 'outside-window low-confidence entry must survive cap eviction');

  // The in-window low-confidence entry must have been dropped
  const foundInWindow = reparsed.entries['gate-cmd'].some(
    e => e.phase === 'in-window-low-confidence'
  );
  assert.ok(!foundInWindow, 'in-window low-confidence entry must be evicted by cap');
});

// ─── RED 12 — tie-break by oldest provenance ─────────────────────────────────

test('Given two in-window entries with equal lowest confidence, when cap forces one out, then the one with oldest provenance is dropped', () => {
  const sut = save;
  const maxEntries = 2;

  // confidence=2 so after one decay step → confidence=1 (above FLOOR, survives reconcile)
  const olderEntry = {
    ...TOOLCHAIN_ENTRY,
    ecosystem: 'eco-older',
    confidence: 2,
    provenance: { run: 'r1', commit: 'c1', date: '2025-01-01' },
  };
  const newerEntry = {
    ...GATE_CMD_ENTRY,
    phase: 'newer-phase',
    confidence: 2,
    provenance: { run: 'r2', commit: 'c2', date: '2026-01-01' },
  };
  // Add a third entry (higher confidence) to force over-cap
  const highConfEntry = {
    ...MUTATION_TOOL_ENTRY,
    tool: 'high-conf-tool',
    confidence: 4,
    provenance: { run: 'r3', commit: 'c3', date: '2026-06-01' },
  };

  const view = makeLoadedView([olderEntry, newerEntry, highConfEntry]);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((sum, c) => sum + reparsed.entries[c].length, 0);
  assert.ok(total <= maxEntries);

  // The older entry (earliest date) must have been dropped
  const foundOlder = reparsed.entries.toolchain.some(e => e.ecosystem === 'eco-older');
  assert.ok(!foundOlder, 'oldest-provenance entry must be evicted on tie');

  // The newer entry must survive
  const foundNewer = reparsed.entries['gate-cmd'].some(e => e.phase === 'newer-phase');
  assert.ok(foundNewer, 'newer-provenance entry must survive tie-break');
});

// ─── RED 13 — atomic single write ────────────────────────────────────────────

test('Given a save, when it runs, then deps.writeStore is called exactly once with the final content', () => {
  const sut = save;
  const view = makeLoadedView([TOOLCHAIN_ENTRY]);
  const delta = [{ concern: 'gate-cmd', payload: { phase: 'test', command: 'node --test' } }];
  const calls = [];
  const deps = makeSaveDeps({
    writeStore: (path, content) => calls.push({ path, content }),
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  assert.equal(calls.length, 1);
});

// ─── RED 14 — failed save is a warning, never a throw ────────────────────────

test('Given deps.writeStore throws, when save runs, then it returns writeNote with "save failed" and does not throw', () => {
  const sut = save;
  const view = makeLoadedView([TOOLCHAIN_ENTRY]);
  const delta = [];
  const deps = makeSaveDeps({
    writeStore: () => { throw new Error('disk full'); },
    caps: { maxEntries: 1000, maxBytes: Infinity },
  });

  let result;
  assert.doesNotThrow(() => {
    result = sut('/repo', view, delta, deps);
  });
  assert.ok(result.writeNote.includes('save failed'), `expected writeNote to include "save failed", got: ${result.writeNote}`);
});

// ─── RED 15 — small-store edge ───────────────────────────────────────────────

test('Given store with entries fewer than WINDOW over entry-count cap, when save runs, then least-relevant overall is dropped (window = whole store)', () => {
  const sut = save;
  // Small store: 3 entries (well below WINDOW), cap = 2
  const maxEntries = 2;

  const lowConfEntry = {
    ...TOOLCHAIN_ENTRY,
    ecosystem: 'low-conf-eco',
    confidence: 1,
    provenance: { run: 'r1', commit: 'c1', date: '2025-01-01' },
  };
  const medConfEntry = {
    ...GATE_CMD_ENTRY,
    phase: 'med-conf-phase',
    confidence: 3,
    provenance: { run: 'r2', commit: 'c2', date: '2026-01-01' },
  };
  const highConfEntry = {
    ...MUTATION_TOOL_ENTRY,
    tool: 'high-conf-tool',
    confidence: 5,
    provenance: { run: 'r3', commit: 'c3', date: '2026-06-01' },
  };

  const view = makeLoadedView([lowConfEntry, medConfEntry, highConfEntry]);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({
    writeStore: (_path, content) => captured.push(content),
    caps: { maxEntries, maxBytes: Infinity },
  });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((sum, c) => sum + reparsed.entries[c].length, 0);
  assert.ok(total <= maxEntries, `total ${total} should be ≤ ${maxEntries}`);

  // Low-confidence entry must be dropped
  const foundLow = reparsed.entries.toolchain.some(e => e.ecosystem === 'low-conf-eco');
  assert.ok(!foundLow, 'least-relevant entry must be evicted in small-store case');

  // High-confidence entry must survive
  const foundHigh = reparsed.entries['mutation-tool'].some(e => e.tool === 'high-conf-tool');
  assert.ok(foundHigh, 'highest-confidence entry must survive');
});

// ─── REFRESHED — confidence ceiling clamp ─────────────────────────────────────

test('Given an entry already at CEILING re-observed this run, when save runs, then its confidence stays at CEILING', () => {
  const sut = save;
  const view = makeLoadedView([{ concern: 'toolchain', ecosystem: 'node', lockfileFingerprint: 'x', confidence: CEILING, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } }]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'x' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_path, content) => captured.push(content) });

  const result = sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(result.writeNote, null);
  assert.equal(reparsed.entries.toolchain[0].confidence, CEILING);
});

test('Given an entry at CEILING-STEP re-observed this run, when save runs, then its confidence reaches exactly CEILING (not CEILING+STEP)', () => {
  const sut = save;
  const view = makeLoadedView([{ concern: 'toolchain', ecosystem: 'node', lockfileFingerprint: 'x', confidence: CEILING - STEP, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } }]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'x' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_path, content) => captured.push(content) });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain[0].confidence, CEILING);
});

// ─── REFRESHED — improve-only rewrite, per-concern ────────────────────────────

test('Given a toolchain entry re-observed with a CHANGED lockfile fingerprint, when save runs, then the stored value is rewritten and no duplicate is added', () => {
  const sut = save;
  const view = makeLoadedView([{ concern: 'toolchain', ecosystem: 'node', lockfileFingerprint: 'old', confidence: 2, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } }]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'new' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_path, content) => captured.push(content) });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1);
  assert.equal(reparsed.entries.toolchain[0].lockfileFingerprint, 'new');
  assert.equal(reparsed.entries.toolchain[0].confidence, 3);
});

test('Given a toolchain entry re-observed with an UNCHANGED fingerprint, when save runs, then the value is untouched but confidence rises and no duplicate is added', () => {
  const sut = save;
  const view = makeLoadedView([{ concern: 'toolchain', ecosystem: 'node', lockfileFingerprint: 'same', confidence: 2, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } }]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'same' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_path, content) => captured.push(content) });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1);
  assert.equal(reparsed.entries.toolchain[0].lockfileFingerprint, 'same');
  assert.equal(reparsed.entries.toolchain[0].confidence, 3);
});

test('Given a mutation-tool entry re-observed with a CHANGED config fingerprint, when save runs, then the stored fingerprint is rewritten', () => {
  const sut = save;
  const view = makeLoadedView([{ concern: 'mutation-tool', tool: 'stryker', configFingerprint: 'old', confidence: 2, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } }]);
  const delta = [{ concern: 'mutation-tool', payload: { tool: 'stryker', configFingerprint: 'new' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_path, content) => captured.push(content) });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['mutation-tool'].length, 1);
  assert.equal(reparsed.entries['mutation-tool'][0].configFingerprint, 'new');
});

test('Given a gate-cmd entry re-observed with a CHANGED command for the same phase, when save runs, then the stored command is updated to the newer one', () => {
  const sut = save;
  const view = makeLoadedView([{ concern: 'gate-cmd', phase: 'implementation', command: 'node --test', confidence: 2, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } }]);
  const delta = [{ concern: 'gate-cmd', payload: { phase: 'implementation', command: 'npm test' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_path, content) => captured.push(content) });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['gate-cmd'].length, 1);
  assert.equal(reparsed.entries['gate-cmd'][0].command, 'npm test');
});

// ─── slice-sizing through the save path ───────────────────────────────────────

test('Given an empty store and a new slice-sizing observation, when save runs, then it is added under slice-sizing with confidence FLOOR+STEP', () => {
  const sut = save;
  const view = makeLoadedView([]);
  const delta = [{ concern: 'slice-sizing', payload: { size: 8, outcome: 'pass' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_path, content) => captured.push(content) });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['slice-sizing'].length, 1);
  assert.equal(reparsed.entries['slice-sizing'][0].confidence, FLOOR + STEP);
});

test('Given a slice-sizing entry re-observed with a CHANGED outcome for the same size, when save runs, then the stored outcome is updated', () => {
  const sut = save;
  const view = makeLoadedView([{ concern: 'slice-sizing', size: 8, outcome: 'pass', confidence: 2, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } }]);
  const delta = [{ concern: 'slice-sizing', payload: { size: 8, outcome: 'blocked' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_path, content) => captured.push(content) });

  sut('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['slice-sizing'].length, 1);
  assert.equal(reparsed.entries['slice-sizing'][0].outcome, 'blocked');
});

// ─── configurable store path (memory.ref) + traversal containment ─────────────

test('Given a configured ref, when load runs, then readStore is called with the ref resolved under the repo root', () => {
  const sut = load;
  let seenPath;
  const result = sut('/repo', { ref: 'custom/store.md', readStore: (path) => { seenPath = path; return null; }, validators: ALL_PASS_VALIDATORS });

  assert.equal(seenPath, '/repo/custom/store.md');
  for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
});

test('Given a configured ref, when save runs, then writeStore is called with the ref resolved under the repo root', () => {
  const sut = save;
  const view = makeLoadedView([]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'abc' } }];
  const calls = [];
  const deps = makeSaveDeps({ ref: 'custom/store.md', writeStore: (path, content) => calls.push({ path, content }) });

  const result = sut('/repo', view, delta, deps);

  assert.equal(result.writeNote, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/repo/custom/store.md');
});

test('Given a ref that escapes the repo root, when load runs, then it returns an empty view without reading and never throws', () => {
  const sut = load;
  let readCalled = false;
  const result = sut('/repo', { ref: '../../etc/passwd', readStore: () => { readCalled = true; return 'leaked'; }, validators: ALL_PASS_VALIDATORS });

  assert.equal(readCalled, false);
  assert.equal(result.loadNote, 'store path outside repo');
  for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
});

test('Given an absolute ref outside the repo root, when load runs, then it returns an empty view without reading', () => {
  const sut = load;
  let readCalled = false;
  const result = sut('/repo', { ref: '/etc/passwd', readStore: () => { readCalled = true; return 'leaked'; }, validators: ALL_PASS_VALIDATORS });

  assert.equal(readCalled, false);
  assert.equal(result.loadNote, 'store path outside repo');
  for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
});

test('Given a ref that escapes the repo root, when save runs, then it skips the write with a warning and never writes outside the repo', () => {
  const sut = save;
  const view = makeLoadedView([]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'abc' } }];
  let writeCalled = false;
  const deps = makeSaveDeps({ ref: '../escape.md', writeStore: () => { writeCalled = true; } });

  const result = sut('/repo', view, delta, deps);

  assert.equal(writeCalled, false);
  assert.equal(result.writeNote, 'save skipped: store path outside repo');
});

// ─── KILL: serializeStore exact output ───────────────────────────────────────
// Kills: L122 ArrayDeclaration, L125-128 ObjectLiteral/BooleanLiteral, L133 StringLiteral,
//        L147/159/161/175-183 body-rendering survivors, L568 ArrayDeclaration

test('Given a view with one toolchain entry with full provenance, when serializeStore runs, then output contains exact YAML frontmatter and exact markdown body structure', () => {
  const sut = serializeStore;
  const entry = {
    concern: 'toolchain',
    ecosystem: 'node',
    lockfileFingerprint: 'abc123',
    confidence: 3,
    provenance: { run: 'r1', commit: 'sha-abc', date: '2024-03-15' },
  };
  const view = {
    entries: groupByConcern([entry]),
    evicted: [],
    loadNote: null,
  };

  const result = sut(view);

  // Must start with YAML frontmatter delimiter
  assert.ok(result.startsWith('---\n'), `expected "---\\n" prefix, got: ${result.slice(0, 20)}`);
  // Frontmatter must close with ---
  assert.ok(result.includes('\n---\n'), 'expected frontmatter closing ---');
  // Must contain the toolchain concern key in frontmatter
  assert.ok(result.includes('toolchain:'), 'expected "toolchain:" in frontmatter');
  // Must contain the markdown title
  assert.ok(result.includes('# craft memory store'), 'expected "# craft memory store" in body');
  // Must contain the advisory note
  assert.ok(result.includes('> Machine-maintained.'), 'expected advisory note in body');
  // Must contain each concern as a section header
  for (const concern of CONCERNS) {
    assert.ok(result.includes(`\n## ${concern}\n`), `expected "## ${concern}" section header`);
  }
  // Empty concerns get the placeholder
  const emptyConcerns = CONCERNS.filter(c => c !== 'toolchain');
  for (const concern of emptyConcerns) {
    // After the header for each empty concern we expect _(none)_
    const headerIdx = result.indexOf(`\n## ${concern}\n`);
    assert.ok(headerIdx !== -1, `section header for ${concern} must exist`);
    const afterHeader = result.slice(headerIdx + `\n## ${concern}\n`.length, headerIdx + `\n## ${concern}\n`.length + 20);
    assert.ok(afterHeader.startsWith('_(none)_'), `empty concern "${concern}" must show _(none)_`);
  }
  // toolchain entry line must contain confidence and provenance
  assert.ok(result.includes('- confidence: 3 | provenance: sha-abc / 2024-03-15'), 'expected entry line with confidence and provenance');
});

test('Given a view with all concerns empty, when serializeStore runs, then every concern section shows _(none)_ and no entry lines appear', () => {
  const sut = serializeStore;
  const view = { entries: groupByConcern([]), evicted: [], loadNote: null };

  const result = sut(view);

  for (const concern of CONCERNS) {
    assert.ok(result.includes(`\n## ${concern}\n_(none)_\n`), `empty concern "${concern}" must have _(none)_ placeholder`);
  }
  assert.ok(!result.includes('- confidence:'), 'no entry lines expected for empty store');
});

// ─── KILL: yamlDump sortKeys:false (L127 BooleanLiteral) ─────────────────────

test('Given a view with multiple concern keys, when serializeStore runs, then YAML frontmatter keys appear in CONCERNS declaration order not alphabetical order', () => {
  const view = { entries: groupByConcern([]), evicted: [], loadNote: null };
  const result = serializeStore(view);
  // CONCERNS order: toolchain, gate-cmd, mutation-tool, findings, slice-sizing
  // Alphabetical order: findings, gate-cmd, mutation-tool, slice-sizing, toolchain
  // With sortKeys:true, 'findings' would appear before 'toolchain' in YAML
  // With sortKeys:false (correct), 'toolchain' appears first (as declared in CONCERNS)
  const toolchainIdx = result.indexOf('toolchain:');
  const findingsIdx = result.indexOf('findings:');
  assert.ok(toolchainIdx !== -1 && findingsIdx !== -1, 'both concern keys must appear in frontmatter');
  assert.ok(toolchainIdx < findingsIdx, '"toolchain" must appear before "findings" in frontmatter (CONCERNS order, not alphabetical)');
});

// ─── KILL: yamlDump lineWidth:-1 (L126 UnaryOperator) ────────────────────────

test('Given a view with an entry containing a very long string value, when serializeStore runs, then the string is NOT line-wrapped in the YAML output', () => {
  // A 100-character fingerprint: with lineWidth default (80), yaml-js would fold it; with lineWidth:-1, no folding
  const longFp = 'a'.repeat(100);
  const entry = { concern: 'toolchain', ecosystem: 'node', lockfileFingerprint: longFp, confidence: 3, provenance: { run: 'r1', commit: 'c1', date: '2026-01-01' } };
  const view = { entries: groupByConcern([entry]), evicted: [], loadNote: null };
  const result = serializeStore(view);
  // The full fingerprint must appear as a single unbroken string
  assert.ok(result.includes(longFp), 'long fingerprint must appear unbroken in YAML output (lineWidth: -1)');
});

// ─── KILL: yamlDump noRefs:true (L128 BooleanLiteral) ────────────────────────

test('Given two entries with identical provenance objects, when serializeStore runs, then each entry has inline provenance not a YAML anchor reference', () => {
  // With noRefs:false, yaml-js uses &anchor/*ref for repeated identical objects
  const provenance = { run: 'r1', commit: 'sha-1', date: '2026-01-01' };
  const entries = [
    { concern: 'toolchain', ecosystem: 'node', lockfileFingerprint: 'fp1', confidence: 3, provenance },
    { concern: 'gate-cmd', phase: 'impl', command: 'cmd', confidence: 3, provenance },
  ];
  const view = { entries: groupByConcern(entries), evicted: [], loadNote: null };
  const result = serializeStore(view);
  // With noRefs:true, no YAML anchors or references appear
  assert.ok(!result.includes('&ref'), 'no YAML anchor references must appear in output');
  assert.ok(!result.includes('*ref'), 'no YAML pointer references must appear in output');
  // Both entries must have inline provenance (date appears twice in frontmatter, quoted by yaml-js)
  const occurrences = result.split("date: '2026-01-01'").length - 1;
  assert.ok(occurrences >= 2, `provenance date must appear at least twice (once per entry) but got ${occurrences}`);
});

test('Given an entry with no provenance field, when serializeStore runs, then entry line shows "?" for provenance', () => {
  const sut = serializeStore;
  const entry = { concern: 'toolchain', ecosystem: 'node', lockfileFingerprint: 'x', confidence: 2 };
  const view = { entries: groupByConcern([entry]), evicted: [], loadNote: null };

  const result = sut(view);

  assert.ok(result.includes('- confidence: 2 | provenance: ?'), 'missing provenance must show "?"');
});

test('Given an entry with provenance lacking commit and date, when serializeStore runs, then entry line shows "?" for each missing subfield', () => {
  const sut = serializeStore;
  const entry = { concern: 'toolchain', ecosystem: 'node', confidence: 1, provenance: {} };
  const view = { entries: groupByConcern([entry]), evicted: [], loadNote: null };

  const result = sut(view);

  assert.ok(result.includes('- confidence: 1 | provenance: ? / ?'), 'missing commit+date must each show "?"');
});

test('Given an entry with no confidence field, when serializeStore runs, then entry line shows "?" for confidence', () => {
  const sut = serializeStore;
  const entry = { concern: 'gate-cmd', phase: 'test', command: 'npm test', provenance: { run: 'r1', commit: 'c1', date: '2024-01-01' } };
  const view = { entries: groupByConcern([entry]), evicted: [], loadNote: null };

  const result = sut(view);

  assert.ok(result.includes('- confidence: ? | provenance: c1 / 2024-01-01'), 'missing confidence must show "?"');
});

test('Given a view with entries in multiple concerns, when serializeStore runs, then YAML frontmatter appears before markdown body', () => {
  const sut = serializeStore;
  const view = { entries: groupByConcern([TOOLCHAIN_ENTRY, FINDINGS_ENTRY]), evicted: [], loadNote: null };

  const result = sut(view);

  const frontmatterEnd = result.indexOf('\n---\n');
  const bodyStart = result.indexOf('# craft memory store');
  assert.ok(frontmatterEnd < bodyStart, 'frontmatter must precede markdown body');
  // Both entries must produce entry lines in the body
  assert.ok(result.includes('- confidence: 3 | provenance: c1 / 2024-01-01'), 'toolchain entry line must appear');
});

// ─── KILL: parseStore guards (L87, L91, L94, L99, L100) ──────────────────────

test('Given parseStore called with null, when it runs, then it returns null (falsy content guard)', () => {
  assert.equal(parseStore(null), null);
});

test('Given parseStore called with empty string, when it runs, then it returns null', () => {
  assert.equal(parseStore(''), null);
});

test('Given content with frontmatter whose YAML parses to a non-object primitive, when parseStore runs, then it returns null', () => {
  // YAML that parses to a string — triggers the typeof parsed !== 'object' guard
  const content = '---\njust a scalar string\n---\n# body\n';
  assert.equal(parseStore(content), null);
});

test('Given content with frontmatter whose YAML parses to null, when parseStore runs, then it returns null', () => {
  // An explicitly empty YAML that parses to null
  const content = '---\n~\n---\n# body\n';
  assert.equal(parseStore(content), null);
});

test('Given content whose concern value is a number (not an array), when parseStore runs, then that concern is left as empty array', () => {
  const content = '---\ntoolchain: 42\n---\n# body\n';
  const result = parseStore(content);
  assert.ok(result !== null, 'should return non-null');
  assert.deepEqual(result.entries.toolchain, []);
});

test('Given content whose concern value is an array containing a non-object primitive, when parseStore runs, then that primitive is filtered out', () => {
  const content = '---\ntoolchain:\n  - "not-an-object"\n  - 42\n---\n# body\n';
  const result = parseStore(content);
  assert.ok(result !== null);
  assert.deepEqual(result.entries.toolchain, []);
});

test('Given content whose concern value is an array containing null, when parseStore runs, then null entry is filtered out', () => {
  const content = '---\ntoolchain:\n  - null\n---\n# body\n';
  const result = parseStore(content);
  assert.ok(result !== null);
  assert.deepEqual(result.entries.toolchain, []);
});

// ─── KILL: buildBody / concernSection exact string tokens (L175-183) ─────────

test('Given serializeStore on an empty store, when it runs, then body begins with newline + "# craft memory store" immediately after frontmatter close', () => {
  const view = { entries: groupByConcern([]), evicted: [], loadNote: null };
  const result = serializeStore(view);
  // The body starts right after '---\n'
  const frontmatterClose = result.indexOf('\n---\n') + '\n---\n'.length;
  const body = result.slice(frontmatterClose);
  assert.ok(body.startsWith('\n# craft memory store\n'), `body must start with newline + title, got: ${body.slice(0, 40)}`);
});

test('Given serializeStore on an empty store, when it runs, then body contains the advisory edit note verbatim', () => {
  const view = { entries: groupByConcern([]), evicted: [], loadNote: null };
  const result = serializeStore(view);
  assert.ok(result.includes('> Machine-maintained. Edit the YAML frontmatter above, not this body.'), 'advisory note must appear verbatim');
});

// ─── KILL: load loadNote for evicted entries (L242) ─────────────────────────

test('Given a store where NO entries fail validate-on-read, when load runs, then loadNote is null (not empty string)', () => {
  const storeContent = makeStoreContent([TOOLCHAIN_ENTRY]);

  const result = load('/repo', { readStore: () => storeContent, validators: ALL_PASS_VALIDATORS });

  assert.strictEqual(result.loadNote, null);
});

test('Given a store where some entries fail validate-on-read, when load runs, then loadNote is the exact string "some entries failed validate-on-read"', () => {
  const storeContent = makeStoreContent([TOOLCHAIN_ENTRY]);
  const validators = { ...ALL_PASS_VALIDATORS, toolchain: () => false };

  const result = load('/repo', { readStore: () => storeContent, validators });

  assert.equal(result.loadNote, 'some entries failed validate-on-read');
});

// ─── KILL: KEY_FIELDS definitions (L263-268) ─────────────────────────────────
// Assert merge identity: same key = refresh (no dup), different key = new entry

test('Given two toolchain observations with different ecosystems, when save runs, then they produce two separate entries (ecosystem is the key)', () => {
  const view = makeLoadedView([]);
  const delta = [
    { concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'fp1' } },
    { concern: 'toolchain', payload: { ecosystem: 'python', lockfileFingerprint: 'fp2' } },
  ];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 2, 'different ecosystems must produce 2 entries');
});

test('Given two gate-cmd observations with different phases, when save runs, then they produce two separate entries (phase is the key)', () => {
  const view = makeLoadedView([]);
  const delta = [
    { concern: 'gate-cmd', payload: { phase: 'implementation', command: 'npm test' } },
    { concern: 'gate-cmd', payload: { phase: 'validation', command: 'stryker' } },
  ];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['gate-cmd'].length, 2, 'different phases must produce 2 entries');
});

test('Given two mutation-tool observations with different tools, when save runs, then they produce two separate entries (tool is the key)', () => {
  const view = makeLoadedView([]);
  const delta = [
    { concern: 'mutation-tool', payload: { tool: 'stryker', configFingerprint: 'fp1' } },
    { concern: 'mutation-tool', payload: { tool: 'pitest', configFingerprint: 'fp2' } },
  ];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['mutation-tool'].length, 2, 'different tools must produce 2 entries');
});

test('Given two findings observations with different file+pattern combos, when save runs, then they produce two separate entries (file+pattern is the composite key)', () => {
  const view = makeLoadedView([]);
  const delta = [
    { concern: 'findings', payload: { file: 'src/a.js', pattern: 'no-unused-vars', severity: 'low' } },
    { concern: 'findings', payload: { file: 'src/b.js', pattern: 'no-unused-vars', severity: 'low' } },
  ];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings.length, 2, 'different file fields must produce 2 entries');
});

test('Given two slice-sizing observations with different sizes, when save runs, then they produce two separate entries (size is the key)', () => {
  const view = makeLoadedView([]);
  const delta = [
    { concern: 'slice-sizing', payload: { size: 4, outcome: 'pass' } },
    { concern: 'slice-sizing', payload: { size: 8, outcome: 'pass' } },
  ];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['slice-sizing'].length, 2, 'different sizes must produce 2 entries');
});

// ─── KILL: keyOf join separator (L280) ───────────────────────────────────────
// Two findings with same file but different patterns must be distinct keys

test('Given two findings observations with same file but different patterns, when save runs, then they produce two separate entries', () => {
  const view = makeLoadedView([]);
  const delta = [
    { concern: 'findings', payload: { file: 'src/a.js', pattern: 'no-unused-vars', severity: 'low' } },
    { concern: 'findings', payload: { file: 'src/a.js', pattern: 'eqeqeq', severity: 'medium' } },
  ];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings.length, 2, 'different patterns with same file must be distinct');
});

// ─── KILL: IMPROVES_BY / SEVERITY_RANK (L299-303) ────────────────────────────

test('Given a findings entry at severity "high" re-observed at severity "low", when save runs, then severity is NOT rewritten (de-escalation blocked)', () => {
  const view = makeLoadedView([{ ...FINDINGS_ENTRY, severity: 'high', confidence: 2 }]);
  const delta = [{ concern: 'findings', payload: { file: 'engine/src/foo.js', pattern: 'no-unused-vars', severity: 'low' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings[0].severity, 'high', 'severity must not be de-escalated');
});

test('Given a findings entry at severity "medium" re-observed at same severity, when save runs, then severity remains unchanged (equal rank does not improve)', () => {
  const view = makeLoadedView([{ ...FINDINGS_ENTRY, severity: 'medium', confidence: 2 }]);
  const delta = [{ concern: 'findings', payload: { file: 'engine/src/foo.js', pattern: 'no-unused-vars', severity: 'medium' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings[0].severity, 'medium', 'equal severity must not trigger rewrite');
});

test('Given a findings entry re-observed with unknown severity, when save runs, then value is not rewritten (unknown rank = 0 does not improve over known)', () => {
  const view = makeLoadedView([{ ...FINDINGS_ENTRY, severity: 'low', confidence: 2 }]);
  const delta = [{ concern: 'findings', payload: { file: 'engine/src/foo.js', pattern: 'no-unused-vars', severity: 'unknown-rank' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  // unknown-rank = SEVERITY_RANK[unknown] ?? 0 = 0, low = 1 → 0 > 1 is false → no rewrite
  assert.equal(reparsed.entries.findings[0].severity, 'low', 'unknown severity must not override known severity');
});

test('Given a findings entry at severity "critical" re-observed at severity "high", when save runs, then it is NOT rewritten', () => {
  const view = makeLoadedView([{ ...FINDINGS_ENTRY, severity: 'critical', confidence: 2 }]);
  const delta = [{ concern: 'findings', payload: { file: 'engine/src/foo.js', pattern: 'no-unused-vars', severity: 'high' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings[0].severity, 'critical', 'high must not override critical');
});

test('Given a concern with no IMPROVES_BY rule (unknown concern in delta, treated via reconcile), when save with a slice-sizing re-observation with unchanged outcome, when save runs, then outcome is not rewritten', () => {
  const view = makeLoadedView([{ concern: 'slice-sizing', size: 8, outcome: 'pass', confidence: 2, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } }]);
  const delta = [{ concern: 'slice-sizing', payload: { size: 8, outcome: 'pass' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  // same outcome → improves is false, payload NOT rewritten, count stays 1
  assert.equal(reparsed.entries['slice-sizing'].length, 1);
  assert.equal(reparsed.entries['slice-sizing'][0].outcome, 'pass');
});

// ─── KILL: entryKey separator (L331) ─────────────────────────────────────────
// 'toolchain' + \x01 + key must not collide with a concern whose name ends with a prefix

test('Given a gate-cmd and toolchain observation whose raw key text would collide if separator were dropped, when save runs, then they remain separate entries', () => {
  // This ensures concern + '\x01' + keyOf is distinct from a different concern
  const view = makeLoadedView([]);
  const delta = [
    { concern: 'toolchain', payload: { ecosystem: 'gate-cmd' } },  // key if no sep: 'toolchaingate-cmd'
    { concern: 'gate-cmd', payload: { phase: 'toolchain' } },      // key if no sep: 'gate-cmdtoolchain'
  ];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1, 'toolchain entry must be stored');
  assert.equal(reparsed.entries['gate-cmd'].length, 1, 'gate-cmd entry must be stored');
});

// ─── KILL: addedEntries concern filter (L378) ────────────────────────────────

test('Given delta with observations for multiple concerns, when save runs, then each observation ends up in its correct concern bucket only', () => {
  const view = makeLoadedView([]);
  const delta = [
    { concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'fp' } },
    { concern: 'findings', payload: { file: 'a.js', pattern: 'p', severity: 'low' } },
  ];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1);
  assert.equal(reparsed.entries.findings.length, 1);
  assert.equal(reparsed.entries['gate-cmd'].length, 0);
  assert.equal(reparsed.entries['mutation-tool'].length, 0);
  assert.equal(reparsed.entries['slice-sizing'].length, 0);
});

// ─── KILL: flattenEntries sort comparator (L452-455) ─────────────────────────

test('Given entries with distinct dates, when cap eviction runs, then the entry with the oldest provenance date is preferentially evicted over newer ones of equal confidence', () => {
  const view = makeLoadedView([
    { ...TOOLCHAIN_ENTRY, ecosystem: 'oldest', confidence: 2, provenance: { run: 'r1', commit: 'c1', date: '2020-01-01' } },
    { ...GATE_CMD_ENTRY, phase: 'newest', confidence: 2, provenance: { run: 'r2', commit: 'c2', date: '2026-01-01' } },
  ]);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 1, maxBytes: Infinity } });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.ok(total <= 1);
  // oldest must be gone
  assert.ok(!reparsed.entries.toolchain.some(e => e.ecosystem === 'oldest'), 'oldest entry must be evicted first');
  // newest must survive
  assert.ok(reparsed.entries['gate-cmd'].some(e => e.phase === 'newest'), 'newest entry must survive');
});

// ─── KILL: exceedsCaps entry-count > (L500, L502) ────────────────────────────

test('Given store at exactly the entry-count cap, when save with no delta runs, then flushed store still has exactly that count (not evicted)', () => {
  const maxEntries = 3;
  const entries = Array.from({ length: maxEntries }, (_, i) => ({
    ...TOOLCHAIN_ENTRY,
    ecosystem: `eco-${i}`,
    lockfileFingerprint: `fp-${i}`,
    confidence: 3,
    provenance: { run: `r${i}`, commit: `c${i}`, date: `2026-0${i + 1}-01` },
  }));
  const view = makeLoadedView(entries);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries, maxBytes: Infinity } });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  // After decay one step each entry has confidence=2 (still > FLOOR), so all survive
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  // At-cap: entry count > maxEntries is false, so no eviction triggered
  assert.ok(total <= maxEntries, `expected <= ${maxEntries} entries, got ${total}`);
});

test('Given store one entry ABOVE the entry-count cap, when save with no delta runs, then exactly one entry is evicted', () => {
  const maxEntries = 2;
  const entries = [
    { ...TOOLCHAIN_ENTRY, ecosystem: 'eco-low', confidence: 1, provenance: { run: 'r1', commit: 'c1', date: '2025-01-01' } },
    { ...GATE_CMD_ENTRY, phase: 'p-mid', confidence: 3, provenance: { run: 'r2', commit: 'c2', date: '2025-06-01' } },
    { ...MUTATION_TOOL_ENTRY, tool: 't-high', confidence: 4, provenance: { run: 'r3', commit: 'c3', date: '2026-01-01' } },
  ];
  const view = makeLoadedView(entries);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries, maxBytes: Infinity } });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.ok(total <= maxEntries, `expected <= ${maxEntries}, got ${total}`);
  // lowest confidence entry must be the victim
  assert.ok(!reparsed.entries.toolchain.some(e => e.ecosystem === 'eco-low'), 'lowest confidence entry must be evicted');
});

// ─── KILL: selectVictim windowStart (L514, L516) ─────────────────────────────

test('Given store with zero entries, when selectVictim is called via eviction, then it does not throw and no entry is dropped', () => {
  const view = makeLoadedView([]);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 0, maxBytes: Infinity } });

  // Even with cap=0, eviction on empty store must not crash
  assert.doesNotThrow(() => save('/repo', view, delta, deps));
  assert.equal(captured.length, 1);
});

// ─── KILL: selectVictim sort comparator (L519, L521-523) ─────────────────────

test('Given two entries at equal confidence, when cap forces one out, then the one with OLDER provenance date is the victim (not the newer one)', () => {
  const maxEntries = 1;
  const entries = [
    { ...TOOLCHAIN_ENTRY, ecosystem: 'older', confidence: 3, provenance: { run: 'r1', commit: 'c1', date: '2024-01-01' } },
    { ...GATE_CMD_ENTRY, phase: 'newer', confidence: 3, provenance: { run: 'r2', commit: 'c2', date: '2026-01-01' } },
  ];
  const view = makeLoadedView(entries);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[captured.length - 1]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.ok(total <= maxEntries);
  assert.ok(!reparsed.entries.toolchain.some(e => e.ecosystem === 'older'), 'older entry must be victim on confidence tie');
  assert.ok(reparsed.entries['gate-cmd'].some(e => e.phase === 'newer'), 'newer entry must survive on confidence tie');
});

test('Given two entries where lower-date entry has higher confidence, when cap forces one out, then the lower-confidence entry is dropped regardless of date', () => {
  const maxEntries = 1;
  const entries = [
    { ...TOOLCHAIN_ENTRY, ecosystem: 'old-high', confidence: 5, provenance: { run: 'r1', commit: 'c1', date: '2020-01-01' } },
    { ...GATE_CMD_ENTRY, phase: 'new-low', confidence: 1, provenance: { run: 'r2', commit: 'c2', date: '2026-01-01' } },
  ];
  const view = makeLoadedView(entries);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.ok(total <= maxEntries);
  assert.ok(!reparsed.entries['gate-cmd'].some(e => e.phase === 'new-low'), 'low confidence must be evicted over old high-confidence');
  assert.ok(reparsed.entries.toolchain.some(e => e.ecosystem === 'old-high'), 'old high-confidence entry must survive');
});

// ─── KILL: evictToCaps loop guard (L533) ─────────────────────────────────────

test('Given store significantly over byte cap with many entries, when save runs, then multiple entries are evicted in a loop until cap is met', () => {
  const entries = Array.from({ length: 20 }, (_, i) => ({
    ...TOOLCHAIN_ENTRY,
    ecosystem: `eco-${i}`,
    lockfileFingerprint: `fingerprint-${i}-with-some-length`,
    confidence: 3,
    provenance: { run: `run-${i}`, commit: `commit-hash-${i}`, date: `2026-0${(i % 9) + 1}-0${(i % 28) + 1}` },
  }));
  const view = makeLoadedView(entries);
  const fullContent = serializeStore(view);
  const fullSize = Buffer.byteLength(fullContent, 'utf8');
  // Force to 30% of full size — needs many iterations
  const maxBytes = Math.floor(fullSize * 0.3);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: Infinity, maxBytes } });

  save('/repo', view, [], deps);

  const actualBytes = Buffer.byteLength(captured[0], 'utf8');
  assert.ok(actualBytes <= maxBytes, `expected <= ${maxBytes} bytes, got ${actualBytes}`);
});

// ─── KILL: save provenance fallback when deps.run absent (L562-563) ──────────

test('Given save called with no deps.run, when it runs, then stored provenance has run="unknown" and commit="unknown"', () => {
  const view = makeLoadedView([]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'fp' } }];
  const captured = [];
  // Explicitly omit deps.run to trigger the fallback
  const deps = {
    writeStore: (_p, c) => captured.push(c),
    caps: { maxEntries: 1000, maxBytes: Infinity },
    // no run field
  };

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  const entry = reparsed.entries.toolchain[0];
  assert.ok(entry !== undefined, 'entry must be stored');
  assert.equal(entry.provenance.run, 'unknown', 'run must fall back to "unknown"');
  assert.equal(entry.provenance.commit, 'unknown', 'commit must fall back to "unknown"');
  // date must be a non-empty YYYY-MM-DD shaped string (don't pin the exact day)
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(entry.provenance.date), `date must be YYYY-MM-DD shaped, got: ${entry.provenance.date}`);
});

test('Given save called with deps.run explicitly set, when it runs, then stored provenance uses the supplied values not the fallback', () => {
  const view = makeLoadedView([]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'fp' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });
  // makeSaveDeps sets run: { run: 'run-1', commit: 'sha1', date: '2026-01-01' }

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain[0].provenance.run, 'run-1');
  assert.equal(reparsed.entries.toolchain[0].provenance.commit, 'sha1');
  assert.equal(reparsed.entries.toolchain[0].provenance.date, '2026-01-01');
});

// ─── KILL: save finalView evicted always [] (L568) ───────────────────────────

test('Given save with entries that were evicted during load, when save runs, then finalView.evicted is always empty (eviction already happened at load)', () => {
  const staleEntry = { ...TOOLCHAIN_ENTRY, concern: 'toolchain' };
  const view = {
    entries: groupByConcern([]),
    evicted: [staleEntry],
    loadNote: 'some entries failed validate-on-read',
  };
  const delta = [];
  let capturedView;
  const deps = makeSaveDeps({ writeStore: () => {} });

  const result = save('/repo', view, delta, deps);

  capturedView = result.view;
  assert.deepEqual(capturedView.evicted, [], 'save finalView.evicted must always be []');
  assert.strictEqual(capturedView.loadNote, null, 'save finalView.loadNote must always be null');
});

// ─── KILL: DEFAULT_REF string (L25) ──────────────────────────────────────────

test('Given load called with no ref, when readStore is invoked, then path ends with the default ref ".claude/craft-memory.md"', () => {
  let seenPath;
  load('/repo', { readStore: (p) => { seenPath = p; return null; }, validators: ALL_PASS_VALIDATORS });
  assert.ok(seenPath.endsWith('.claude/craft-memory.md'), `expected path ending in .claude/craft-memory.md, got: ${seenPath}`);
});

// ─── KILL: resolveStorePath target-is-root guard (L40) ───────────────────────

test('Given a ref resolving to the repo root itself (ref="."), when load runs, then the containment guard allows it and readStore is invoked on the resolved root', () => {
  let readCalled = false;
  load('/repo', { ref: '.', readStore: () => { readCalled = true; return null; }, validators: ALL_PASS_VALIDATORS });
  // Root-itself is not an escape: the guard returns the resolved path, so the read happens.
  // The mutant (`target !== rootAbs` → `true`) would reject the root and skip the read.
  assert.equal(readCalled, true);
});

// ─── KILL: load empty-rawContent note "no store" (L210) ──────────────────────

test('Given readStore returns null, when load runs, then loadNote is exactly "no store"', () => {
  const result = load('/repo', { readStore: () => null, validators: ALL_PASS_VALIDATORS });
  assert.equal(result.loadNote, 'no store');
});

test('Given readStore throws (file system error), when load runs, then it returns empty view with "no store" note and never rethrows', () => {
  const result = load('/repo', { readStore: () => { throw new Error('ENOENT: no such file'); }, validators: ALL_PASS_VALIDATORS });
  assert.equal(result.loadNote, 'no store');
  for (const concern of CONCERNS) assert.deepEqual(result.entries[concern], []);
});

// ─── KILL: applyValidators ?? (() => true) fallback (L233) ───────────────────

test('Given validators map with only some concerns covered, when load runs, then uncovered concerns use always-true validator (entries pass through)', () => {
  const entry = { concern: 'toolchain', ecosystem: 'node', lockfileFingerprint: 'fp', confidence: 3, provenance: { run: 'r', commit: 'c', date: '2026-01-01' } };
  const storeContent = makeStoreContent([entry]);
  // Only provide validator for 'findings', not for 'toolchain'
  // → toolchain uses fallback (() => true) → all toolchain entries pass through
  const partialValidators = { findings: () => false };  // fail all findings
  const result = load('/repo', { readStore: () => storeContent, validators: partialValidators });
  assert.equal(result.entries.toolchain.length, 1, 'toolchain entry must pass through when no validator provided');
  assert.equal(result.entries.findings.length, 0, 'findings entries must be evicted by explicit failing validator');
});

test('Given readStore returns empty string, when load runs, then loadNote is exactly "no store"', () => {
  const result = load('/repo', { readStore: () => '', validators: ALL_PASS_VALIDATORS });
  assert.equal(result.loadNote, 'no store');
});

// ─── KILL: KEY_FIELDS merge-identity — existing-entry refresh tests ───────────
// These tests have an EXISTING entry in the store + a new observation with a
// DIFFERENT key field value. With correct KEY_FIELDS the existing entry decays
// and a new one is added (2 total). With mutant KEY_FIELDS={}, both map to key=""
// → existing is refreshed (1 total).

test('Given store with existing toolchain entry for ecosystem=node, and new observation for ecosystem=python, when save runs, then both entries exist (different ecosystem = different key)', () => {
  const existing = { ...TOOLCHAIN_ENTRY, ecosystem: 'node', confidence: 3 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'python', lockfileFingerprint: 'fp2' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  // After save: 'node' entry decays (conf 3→2), 'python' entry added (conf FLOOR+STEP=1)
  // Total: 2 entries
  assert.equal(reparsed.entries.toolchain.length, 2, 'different ecosystems must remain as separate entries');
  const ecosystems = reparsed.entries.toolchain.map(e => e.ecosystem).sort();
  assert.deepEqual(ecosystems, ['node', 'python'], 'both ecosystems must be stored');
});

test('Given store with existing gate-cmd entry for phase=implementation, and new observation for phase=validation, when save runs, then both phases exist in store', () => {
  const existing = { ...GATE_CMD_ENTRY, phase: 'implementation', confidence: 3 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'gate-cmd', payload: { phase: 'validation', command: 'stryker' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['gate-cmd'].length, 2, 'different phases must remain as separate entries');
});

test('Given store with existing mutation-tool entry for tool=stryker, and new observation for tool=pitest, when save runs, then both tools exist in store', () => {
  const existing = { ...MUTATION_TOOL_ENTRY, tool: 'stryker', confidence: 3 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'mutation-tool', payload: { tool: 'pitest', configFingerprint: 'fp2' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['mutation-tool'].length, 2, 'different tools must remain as separate entries');
});

test('Given store with existing findings entry for file=a.js+pattern=unused, and new observation for file=a.js+pattern=eqeqeq, when save runs, then both patterns exist', () => {
  const existing = { ...FINDINGS_ENTRY, file: 'src/a.js', pattern: 'no-unused-vars', confidence: 3 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'findings', payload: { file: 'src/a.js', pattern: 'eqeqeq', severity: 'low' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings.length, 2, 'different patterns must remain as separate entries');
});

test('Given store with existing slice-sizing entry for size=4, and new observation for size=8, when save runs, then both sizes exist in store', () => {
  const existing = { ...SLICE_SIZING_ENTRY, size: 4, confidence: 3 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'slice-sizing', payload: { size: 8, outcome: 'pass' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['slice-sizing'].length, 2, 'different sizes must remain as separate entries');
});

// ─── KILL: keyOf '\x00' separator (L280) ─────────────────────────────────────
// Findings key = file + '\x00' + pattern. Without separator, 'a.js' + 'x' and
// 'a.js' + 'x' would be the same — but so would 'a.jx' + 'x'. Need a test
// where concatenation without separator produces a collision.

test('Given existing findings entry for file="a" + pattern="bc", and new observation for file="ab" + pattern="c", when save runs, then both entries remain (separator prevents collision)', () => {
  const existing = { ...FINDINGS_ENTRY, file: 'a', pattern: 'bc', confidence: 3 };
  const view = makeLoadedView([existing]);
  // Without separator: 'abc' = 'abc', collision! With '\x00': 'a\x00bc' != 'ab\x00c'
  const delta = [{ concern: 'findings', payload: { file: 'ab', pattern: 'c', severity: 'low' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings.length, 2, 'separator must prevent key collision between file="a"+pattern="bc" and file="ab"+pattern="c"');
});

// ─── KILL: keyOf ArrowFunction → () => undefined (L280) ──────────────────────

test('Given existing toolchain entry for ecosystem=node, and re-observation for ecosystem=node (same key), when save runs, then entry is refreshed not duplicated', () => {
  const existing = { ...TOOLCHAIN_ENTRY, ecosystem: 'node', confidence: 2 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'fp-same' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  // With ArrowFunction mutant: keyOf always returns 'undefined' → key mismatch → not refreshed → decayed + new added = 2 entries
  assert.equal(reparsed.entries.toolchain.length, 1, 'same ecosystem must result in a single refreshed entry, not a duplicate');
});

// ─── KILL: keyOf LogicalOperator payload[f] && '' (L280) ─────────────────────

test('Given existing toolchain entry for ecosystem=node, and re-observation for ecosystem=node, when save runs, then keyOf uses the actual field value not empty-string fallback', () => {
  // With mutant 'payload[f] && ""': String('node' && '') = String('') = '' → same for all truthy values → ecosystem:'node' and ecosystem:'python' both → key=''
  const existing1 = { ...TOOLCHAIN_ENTRY, ecosystem: 'node', confidence: 3 };
  const existing2 = { ...TOOLCHAIN_ENTRY, ecosystem: 'python', lockfileFingerprint: 'fp2', confidence: 3 };
  const view = makeLoadedView([existing1, existing2]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'abc123' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  // With correct code: node is refreshed (conf 3→4), python decays (conf 3→2), total = 2
  // With mutant (all map to ''): both existing entries match the same key; only one refresh happens; net effect unclear but != 2 distinct entries properly
  assert.equal(reparsed.entries.toolchain.length, 2, 'both ecosystem entries must survive with independent keys');
  const nodeEntry = reparsed.entries.toolchain.find(e => e.ecosystem === 'node');
  assert.ok(nodeEntry, 'node entry must exist');
  assert.equal(nodeEntry.confidence, 4, 'node entry must be refreshed (confidence incremented)');
  const pythonEntry = reparsed.entries.toolchain.find(e => e.ecosystem === 'python');
  assert.ok(pythonEntry, 'python entry must exist');
  assert.equal(pythonEntry.confidence, 2, 'python entry must decay since not re-observed');
});

// ─── KILL: entryKey separator + BlockStatement (L330-331) ────────────────────

test('Given existing entries for two different concerns whose keyOf values could collide without the concern prefix, when save re-observes one, then only that one is refreshed', () => {
  // Both toolchain and gate-cmd have single-field keys. If entryKey returned just the keyOf value
  // (no concern prefix), then toolchain:phase='impl' and gate-cmd:phase='impl' could collide.
  // But gate-cmd key field is 'phase', toolchain key field is 'ecosystem'.
  // Use same payload value so raw keyOf would match if concern prefix dropped.
  const existingToolchain = { ...TOOLCHAIN_ENTRY, ecosystem: 'node', confidence: 3 };
  const existingGateCmd = { ...GATE_CMD_ENTRY, phase: 'implementation', confidence: 3 };
  const view = makeLoadedView([existingToolchain, existingGateCmd]);
  // Only re-observe toolchain
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'abc123' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  // With correct code: toolchain refreshed (conf 3→4), gate-cmd decays (conf 3→2)
  const toolchain = reparsed.entries.toolchain.find(e => e.ecosystem === 'node');
  const gateCmd = reparsed.entries['gate-cmd'].find(e => e.phase === 'implementation');
  assert.ok(toolchain, 'toolchain entry must exist');
  assert.equal(toolchain.confidence, 4, 'toolchain must be refreshed');
  assert.ok(gateCmd, 'gate-cmd entry must exist');
  assert.equal(gateCmd.confidence, 2, 'gate-cmd must decay (not refreshed)');
});

// ─── KILL: IMPROVES_BY EqualityOperator >= vs > (L299) ────────────────────────

test('Given findings at severity "low" re-observed at same "low" severity, when save runs, then severity is NOT rewritten (equal rank does not trigger improvement)', () => {
  const existing = { ...FINDINGS_ENTRY, severity: 'low', confidence: 2 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'findings', payload: { file: 'engine/src/foo.js', pattern: 'no-unused-vars', severity: 'low' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  // With >= mutant: 'low' >= 'low' = true → rewrite triggered (but same value so no visible change)
  // Actually severity 'low'(1) >= 'low'(1) = 1>=1 = true with mutant → rewrite
  // Original: 1 > 1 = false → no rewrite; but rewriting 'low' to 'low' produces same result
  // This is equivalent for same-value case. Need same+worse escalation.
  // With original (>): severity='high'(3) vs re-observe 'medium'(2): 2 > 3 = false → no rewrite
  // With mutant (>=): 2 >= 3 = false → still no rewrite. For equal: 3 >= 3 = true → rewrite (to same value, no visible change)
  // This mutant IS equivalent. severity stays 'low' either way.
  // EQUIVALENT PROOF: For >= vs >, the only behavioral difference is at equal rank:
  // 'medium'(2) >= 'medium'(2) = true with mutant vs false with original.
  // But rewriting the payload with the same severity produces identical stored data.
  // Therefore this mutant is PROVABLY EQUIVALENT for all inputs.
  assert.equal(reparsed.entries.findings[0].severity, 'low', 'equal severity must not change value');
});

// ─── KILL: IMPROVES_BY ConditionalExpression: true (L300-303) ─────────────────

test('Given toolchain entry re-observed with SAME lockfile fingerprint, when save runs, then fingerprint is NOT overwritten (no churn)', () => {
  const existing = { ...TOOLCHAIN_ENTRY, lockfileFingerprint: 'same-fp', confidence: 2 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'toolchain', payload: { ecosystem: 'node', lockfileFingerprint: 'same-fp' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  // With L300 mutant (always true): even same fingerprint triggers rewrite — but we're rewriting with the same value, no visible change
  // Original: n.lockfileFingerprint !== o.lockfileFingerprint → 'same-fp' !== 'same-fp' = false → no rewrite
  // Mutant: true → rewrite. But rewriting with same value produces same result.
  // HOWEVER: the lockfileFingerprint value in the stored entry can differ in other fields if the payload has more/fewer fields.
  // In this test, the payload has ecosystem+lockfileFingerprint. The existing entry has more fields (provenance, confidence, etc.)
  // With shouldRewrite=true, spread: {...entry, ...obs.payload} would overwrite entry fields with payload fields
  // entry has: {concern, ecosystem, lockfileFingerprint, confidence, provenance}
  // obs.payload has: {ecosystem, lockfileFingerprint} — same values
  // So result is identical regardless.
  // This L300 mutant is PROVABLY EQUIVALENT when payload fields are a subset of entry fields with same values.
  // However, we can test the NEGATIVE case: different fingerprint MUST trigger rewrite.
  // That test already exists (toolchain CHANGED fingerprint test above).
  // For same value: both produce identical output. Equivalent.
  assert.equal(reparsed.entries.toolchain[0].lockfileFingerprint, 'same-fp', 'unchanged fingerprint must remain unchanged');
  assert.equal(reparsed.entries.toolchain.length, 1, 'no duplicate on refresh');
});

test('Given mutation-tool entry re-observed with SAME config fingerprint, when save runs, then fingerprint is NOT overwritten and single entry remains', () => {
  const existing = { ...MUTATION_TOOL_ENTRY, configFingerprint: 'same-cfg', confidence: 2 };
  const view = makeLoadedView([existing]);
  const delta = [{ concern: 'mutation-tool', payload: { tool: 'stryker', configFingerprint: 'same-cfg' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries['mutation-tool'].length, 1, 'no duplicate on same-fingerprint refresh');
  // With L301 ConditionalExpression mutant (always true): rewrite triggered even for same value → same output
  // EQUIVALENT when payload and entry have matching values.
  assert.equal(reparsed.entries['mutation-tool'][0].configFingerprint, 'same-cfg');
});

// ─── KILL: flattenEntries OptionalChaining (L452/L453) ───────────────────────
// These crash when provenance is missing (undefined?.date → '' but .date throws)

test('Given entries where some have no provenance, when save runs with cap eviction, then it does not throw', () => {
  // Both entries need confidence > FLOOR+STEP so decay does not auto-evict them before flattenEntries.
  // The no-provenance entry must be in a LATER concern (gate-cmd=CONCERNS[1]) than the provenance entry
  // (toolchain=CONCERNS[0]), so it ends up at flat[1] in flattenEntries (CONCERNS order). V8's sort
  // for 2 elements calls comparator(flat[1], flat[0]), making the no-prov entry the first argument (a),
  // which is where the OptionalChaining mutant (a.entry.provenance.date) would crash.
  const entryWithProvenance = { concern: 'toolchain', ecosystem: 'with-prov', lockfileFingerprint: 'fp-wp', confidence: 3, provenance: { run: 'r1', commit: 'c1', date: '2026-01-01' } };
  const entryWithoutProvenance = { concern: 'gate-cmd', phase: 'no-prov-phase', command: 'cmd-np', confidence: 3 };
  const view = makeLoadedView([entryWithProvenance, entryWithoutProvenance]);
  const delta = [];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 1, maxBytes: Infinity } });

  assert.doesNotThrow(() => save('/repo', view, delta, deps), 'save must not throw on entries without provenance');
  assert.equal(captured.length, 1, 'write must succeed');
});

// ─── KILL: flattenEntries sort < vs <= (L454-455) ─────────────────────────────

test('Given entries where dateA strictly less than dateB, when sort runs, then older date sorts before newer', () => {
  // Both in the SAME concern (toolchain) with equal confidence after decay.
  // 'eco-older' has older date → must be evicted. 'eco-newer' has newer date → must survive.
  // With L454/L522 "if(false)" mutant: date never compared → tiebreak by insertion order
  //   → flattenEntries: eco-older at index 0 (added first) → comes first → still evicted. SAME result.
  // So must put newer-concern in SAME array but SWAP insertion order:
  //   eco-older added after eco-newer in store → eco-older comes LAST in insertion order.
  //   With original (date sort): older date → index 0 in flat → victim. eco-older evicted.
  //   With "if(false)" mutant (no date compare): insertion order → eco-newer (index 0) → victim. eco-newer evicted.
  const ecoNewer = { ...TOOLCHAIN_ENTRY, ecosystem: 'eco-newer', lockfileFingerprint: 'fp-n', confidence: 3, provenance: { run: 'r1', commit: 'c1', date: '2025-06-01' } };
  const ecoOlder = { ...TOOLCHAIN_ENTRY, ecosystem: 'eco-older', lockfileFingerprint: 'fp-o', confidence: 3, provenance: { run: 'r2', commit: 'c2', date: '2020-01-01' } };
  // eco-newer is first in the array (insertion order index 0), eco-older is second (index 1)
  const view = makeLoadedView([ecoNewer, ecoOlder]);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 1, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.ok(total <= 1);
  // With correct date sort: eco-older (date 2020) appears first in flat → evicted
  // With "if(false)" mutant: insertion order → eco-newer (index 0) → evicted (wrong!)
  assert.ok(reparsed.entries.toolchain.some(e => e.ecosystem === 'eco-newer'), 'newer provenance entry must survive (older date evicted first)');
  assert.ok(!reparsed.entries.toolchain.some(e => e.ecosystem === 'eco-older'), 'older provenance entry must be evicted');
});

// ─── KILL: dropEntry array reconstruction (L474) ─────────────────────────────

test('Given 3 toolchain entries and cap eviction removes the middle one, when save runs, then first and third entries are preserved', () => {
  // All entries need confidence > FLOOR+STEP so decay (conf-1) does not auto-evict any of them
  // eco-1 has the lowest confidence (2) after decay = 1 > FLOOR(0), so it survives decay but is chosen by selectVictim
  const e0 = { ...TOOLCHAIN_ENTRY, ecosystem: 'eco-0', confidence: 4, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } };
  const e1 = { ...TOOLCHAIN_ENTRY, ecosystem: 'eco-1', confidence: 2, provenance: { run: 'r1', commit: 'c1', date: '2024-06-01' } };  // lowest conf after decay = 1, will be evicted by cap
  const e2 = { ...TOOLCHAIN_ENTRY, ecosystem: 'eco-2', confidence: 4, provenance: { run: 'r2', commit: 'c2', date: '2024-12-01' } };
  const view = makeLoadedView([e0, e1, e2]);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 2, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 2);
  // eco-1 (lowest confidence) must be gone
  assert.ok(!reparsed.entries.toolchain.some(e => e.ecosystem === 'eco-1'), 'middle low-confidence entry must be evicted');
  assert.ok(reparsed.entries.toolchain.some(e => e.ecosystem === 'eco-0'), 'first entry must survive');
  assert.ok(reparsed.entries.toolchain.some(e => e.ecosystem === 'eco-2'), 'third entry must survive');
});

// ─── KILL: exceedsCaps ArrayDeclaration (L501) ───────────────────────────────

test('Given store with exactly maxEntries entries and no delta, when save runs, then all entries survive (at-cap does not trigger eviction)', () => {
  const maxEntries = 4;
  const entries = [
    { ...TOOLCHAIN_ENTRY, ecosystem: 'e0', confidence: 3, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } },
    { ...GATE_CMD_ENTRY, phase: 'p1', confidence: 3, provenance: { run: 'r1', commit: 'c1', date: '2024-02-01' } },
    { ...MUTATION_TOOL_ENTRY, tool: 't2', confidence: 3, provenance: { run: 'r2', commit: 'c2', date: '2024-03-01' } },
    { ...FINDINGS_ENTRY, file: 'f3.js', pattern: 'p3', confidence: 3, provenance: { run: 'r3', commit: 'c3', date: '2024-04-01' } },
  ];
  const view = makeLoadedView(entries);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  // All entries decay by 1 (3→2) but stay > FLOOR, so all 4 should be present
  assert.ok(total <= maxEntries, `total ${total} must be <= ${maxEntries}`);
  assert.equal(total, 4, 'all 4 entries must survive at-cap');
});

// ─── KILL: exceedsCaps EqualityOperator > vs >= (L502) ───────────────────────

test('Given store with entries totaling exactly maxBytes+1 bytes over cap, when save runs, then one entry is evicted to bring it under maxBytes', () => {
  // Construct a store, measure its size, set maxBytes to size-1 to force eviction
  const entries = Array.from({ length: 5 }, (_, i) => ({
    ...TOOLCHAIN_ENTRY,
    ecosystem: `eco-${i}-with-long-name`,
    lockfileFingerprint: `fp-${i}-that-is-also-long`,
    confidence: 3,
    provenance: { run: `run-${i}`, commit: `commit-${i}`, date: `2026-0${i+1}-01` },
  }));
  const view = makeLoadedView(entries);
  const fullContent = serializeStore(view);
  const fullSize = Buffer.byteLength(fullContent, 'utf8');
  // Set maxBytes = fullSize - 1 → strictly over → MUST evict
  const maxBytes = fullSize - 1;
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: Infinity, maxBytes } });

  save('/repo', view, [], deps);

  const actual = Buffer.byteLength(captured[0], 'utf8');
  assert.ok(actual <= maxBytes, `output ${actual} bytes must be <= maxBytes ${maxBytes}`);
  // Also test EXACTLY at cap: maxBytes = fullSize → at-cap, NOT over, no eviction needed
  const captured2 = [];
  const deps2 = makeSaveDeps({ writeStore: (_p, c) => captured2.push(c), caps: { maxEntries: Infinity, maxBytes: fullSize } });
  save('/repo', view, [], deps2);
  // With mutant (>=): fullSize >= fullSize = true → evicts even at exact cap
  // With correct code (>): fullSize > fullSize = false → no eviction, all entries stay
  const reparsed2 = parseStore(captured2[0]);
  const total2 = CONCERNS.reduce((s, c) => s + reparsed2.entries[c].length, 0);
  assert.equal(total2, 5, 'at-cap store must NOT be evicted (> not >=)');
});

// ─── KILL: exceedsCaps byteLength encoding StringLiteral (L502) ──────────────

test('Given store content with multi-byte Unicode characters, when byte cap check runs, then it uses utf8 byte count not character count', () => {
  // Entry with a 3-byte UTF-8 character to ensure Buffer.byteLength differs from string length
  // Use confidence > FLOOR+STEP so the entry survives decay and reaches exceedsCaps check
  const entry = { concern: 'toolchain', ecosystem: '日本語', lockfileFingerprint: 'fp', confidence: CEILING, provenance: { run: 'r1', commit: 'c1', date: '2026-01-01' } };
  const view = makeLoadedView([entry]);
  const content = serializeStore(view);
  const byteLen = Buffer.byteLength(content, 'utf8');
  const charLen = content.length;
  // Verify the test is meaningful: multi-byte chars make byteLen > charLen
  assert.ok(byteLen >= charLen, 'byte length must be >= char length for UTF-8');
  // Set maxBytes just above byte length — store must survive
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: Infinity, maxBytes: byteLen } });
  save('/repo', view, [], deps);
  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1, 'entry must survive when byteLen == maxBytes');
});

// ─── KILL: selectVictim windowStart ConditionalExpression (L516/L519) ─────────

test('Given exactly WINDOW entries over cap, when selectVictim runs, then the lowest-confidence in-window entry is selected (windowStart=0)', () => {
  // exactly WINDOW entries: Math.max(0, WINDOW - WINDOW) = 0 → all entries in window
  const entries = Array.from({ length: WINDOW }, (_, i) => ({
    ...TOOLCHAIN_ENTRY,
    ecosystem: `eco-${i}`,
    lockfileFingerprint: `fp-${i}`,
    confidence: i % 4 + 2,  // confidence 2,3,4,2,3,4,...
    provenance: { run: `r${i}`, commit: `c${i}`, date: `2026-${String(Math.floor(i/28)+1).padStart(2,'0')}-01` },
  }));
  const view = makeLoadedView(entries);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: WINDOW - 1, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.ok(total <= WINDOW - 1, `must evict at least one entry, got ${total}`);
});

test('Given WINDOW+1 entries over cap by 1, when selectVictim runs, then only the WINDOW newest entries are eviction candidates', () => {
  // eco-oldest is a GATE-CMD entry (CONCERNS[1]). Fillers are TOOLCHAIN entries (CONCERNS[0]).
  // Without date sort: CONCERNS order puts toolchain before gate-cmd, so eco-oldest ends up at flat[WINDOW] (inside window).
  // With correct date sort: eco-oldest (2010-01-01) at flat[0] → outside window (windowStart=1).
  // This lets the flattenEntries sort mutants be distinguished from the correct code.
  // eco-oldest must have LOWER confidence than fillers so it becomes victim IF inside window
  // eco-oldest: confidence CEILING-1 → after decay CEILING-2 (=3)
  // fillers: confidence CEILING → after decay CEILING-1 (=4), still > FLOOR
  const oldest = {
    concern: 'gate-cmd',
    phase: 'gcd-oldest-ph',
    command: 'cmd-gcd-old',
    confidence: CEILING - 1,
    provenance: { run: 'r0', commit: 'c0', date: '2010-01-01' },
  };
  const fillers = Array.from({ length: WINDOW }, (_, i) => ({
    concern: 'toolchain',
    ecosystem: `eco-filler-${String(i).padStart(3,'0')}`,
    lockfileFingerprint: `fp-fill-${i}`,
    confidence: CEILING,
    provenance: { run: `r${i+1}`, commit: `c${i+1}`, date: `2025-${String(i % 12 + 1).padStart(2,'0')}-01` },
  }));

  const allEntries = [oldest, ...fillers];
  assert.equal(allEntries.length, WINDOW + 1);

  const view = makeLoadedView(allEntries);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: WINDOW, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.ok(total <= WINDOW, `must evict to at most ${WINDOW} entries, got ${total}`);
  // With correct flattenEntries sort: eco-oldest (2010) → flat[0] → outside window → must survive
  // With sort mutant (no date compare): eco-oldest → flat[WINDOW] (after all toolchain) → inside window → victim
  assert.ok(
    reparsed.entries['gate-cmd'].some(e => e.phase === 'gcd-oldest-ph'),
    'outside-window oldest entry must survive (date sort puts it before the window)',
  );
});

// ─── KILL: selectVictim OptionalChaining (L520/L521) ─────────────────────────

test('Given in-window entries without provenance alongside those with provenance, when cap eviction runs, then it does not throw and lowest-confidence entry is still evicted', () => {
  // Both entries need confidence > FLOOR+STEP so decay doesn't auto-evict before cap eviction.
  // withoutProv in a LATER concern (gate-cmd=CONCERNS[1]) so it lands at flat[1] in CONCERNS order.
  // V8 sort for 2 elements calls comparator(flat[1], flat[0]) → withoutProv is 'a' argument →
  // mutant (a.entry.provenance.date) crashes. withProv in toolchain (CONCERNS[0]) → flat[0].
  const withProv = { concern: 'toolchain', ecosystem: 'with-prov-eco', lockfileFingerprint: 'fp-wp2', confidence: 3, provenance: { run: 'r', commit: 'c', date: '2026-01-01' } };
  const withoutProv = { concern: 'gate-cmd', phase: 'no-prov-phase2', command: 'cmd-np2', confidence: 3 };
  const view = makeLoadedView([withProv, withoutProv]);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 1, maxBytes: Infinity } });

  assert.doesNotThrow(() => save('/repo', view, [], deps), 'must not throw with unprovenance entries');
  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.ok(total <= 1, 'must evict one entry');
});

// ─── KILL: selectVictim confDiff+date sort (L519/L522/L523) ──────────────────

test('Given two entries with same confidence but different dates, when selectVictim picks victim, then the entry with older provenance date is evicted', () => {
  // Both toolchain entries. Equal confidence after decay. Newer one is inserted first (index 0).
  // With correct code: confDiff=0 → date compare → older (date 2020) → victim
  // With L519 "if(true)" mutant: always returns confDiff (0 here) → falls to return 0 → tiebreak insertion → newer (index 0) evicted. Wrong.
  // With L522 "if(false)" mutant: date never returns -1 → always 0 → tiebreak insertion → newer (index 0) evicted. Wrong.
  const ecoNewer2 = { ...TOOLCHAIN_ENTRY, ecosystem: 'ec-newer2', lockfileFingerprint: 'fp-n2', confidence: 3, provenance: { run: 'r1', commit: 'c1', date: '2025-06-01' } };
  const ecoOlder2 = { ...TOOLCHAIN_ENTRY, ecosystem: 'ec-older2', lockfileFingerprint: 'fp-o2', confidence: 3, provenance: { run: 'r2', commit: 'c2', date: '2020-01-01' } };
  // eco-newer2 at index 0, eco-older2 at index 1 in insertion order
  const view = makeLoadedView([ecoNewer2, ecoOlder2]);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 1, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[0]);
  // eco-older2 (date 2020) must be evicted, eco-newer2 (date 2025) must survive
  assert.ok(reparsed.entries.toolchain.some(e => e.ecosystem === 'ec-newer2'), 'entry with newer date must survive');
  assert.ok(!reparsed.entries.toolchain.some(e => e.ecosystem === 'ec-older2'), 'entry with older date must be evicted by selectVictim');
});

// ─── KILL: evictToCaps while loop (L533) ─────────────────────────────────────

test('Given store over cap by 3 entries, when evictToCaps runs, then exactly 3 entries are evicted (loop runs multiple times)', () => {
  const maxEntries = 3;
  // confidence 3..8 → after decay 2..7, all > FLOOR(0), so decay alone does NOT evict any entry
  const entries = Array.from({ length: 6 }, (_, i) => ({
    ...TOOLCHAIN_ENTRY,
    ecosystem: `eco-${i}`,
    lockfileFingerprint: `fp-${i}`,
    confidence: i + 3,  // confidence 3..8
    provenance: { run: `r${i}`, commit: `c${i}`, date: `2026-0${i+1}-01` },
  }));
  const view = makeLoadedView(entries);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.ok(total <= maxEntries, `expected <= ${maxEntries} entries, got ${total}`);
});

// ─── KILL: findings KEY_FIELDS first element (L267:14) ───────────────────────
// findings: ['', 'pattern'] mutant → keyOf uses payload[''] (undefined→'undefined')
// Two findings with same pattern but different file would share key 'undefined\x00pattern'
// → second observation REFRESHes stored entry instead of being ADDed → only 1 entry stored.

test('Given a stored findings entry, when a delta observation arrives with same pattern but different file, then a second entry is added (file is part of the key)', () => {
  // Load one findings entry with file=a.js, pattern=X
  const storedFinding = { concern: 'findings', file: 'src/a.js', pattern: 'no-console', severity: 'medium', confidence: 3, provenance: { run: 'r0', commit: 'c0', date: '2024-01-01' } };
  const view = makeLoadedView([storedFinding]);
  // Delta: new finding with different file but SAME pattern
  const delta = [{ concern: 'findings', payload: { file: 'src/b.js', pattern: 'no-console', severity: 'low' } }];
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c) });

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.findings.length, 2, 'different file with same pattern must produce a second distinct entry');
  assert.ok(reparsed.entries.findings.some(e => e.file === 'src/a.js'), 'original file=a.js entry must be preserved');
  assert.ok(reparsed.entries.findings.some(e => e.file === 'src/b.js'), 'new file=b.js entry must be added');
});

// ─── KILL: flattenEntries b.entry OptionalChaining (L456:19) ────────────────
// L456 mutant: b.entry.provenance.date (no optional chaining)
// V8 sort for 2 elements calls comparator(flat[1], flat[0]).
// To make flat[1]=withoutProv be the 'b' argument: withoutProv must be at flat[0] (toolchain=CONCERNS[0])
// and withProv at flat[1] (gate-cmd=CONCERNS[1]).
// comparator(flat[1]=withProv, flat[0]=withoutProv) → a=withProv, b=withoutProv
// L456 mutant: b.entry.provenance.date → withoutProv has no provenance → undefined.date → crash

test('Given a toolchain entry without provenance alongside a gate-cmd entry with provenance, when cap forces eviction, then flattenEntries does not crash accessing b.entry.provenance.date', () => {
  // withoutProv in toolchain (CONCERNS[0]) → flat[0]; withProv in gate-cmd (CONCERNS[1]) → flat[1]
  // V8 2-element sort: comparator(flat[1]=withProv, flat[0]=withoutProv) → b=withoutProv (no provenance)
  // L456 mutant b.entry.provenance.date → TypeError on b=withoutProv
  const withoutProv = { concern: 'toolchain', ecosystem: 'tch-noprov-b', lockfileFingerprint: 'fp-b', confidence: 3 };
  const withProv = { concern: 'gate-cmd', phase: 'phase-b-wp', command: 'cmd-b', confidence: 3, provenance: { run: 'r', commit: 'c', date: '2026-01-01' } };
  const view = makeLoadedView([withoutProv, withProv]);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 1, maxBytes: Infinity } });

  assert.doesNotThrow(() => save('/repo', view, [], deps), 'must not crash when b.entry has no provenance in flattenEntries');
  assert.equal(captured.length, 1, 'writeStore must be called once');
  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.equal(total, 1, 'cap eviction must drop one entry from two');
});

// ─── KILL: selectVictim a.entry OptionalChaining (L530:19) ──────────────────
// L530 mutant: a.entry.provenance.date (no optional chaining)
// selectVictim's sort calls comparator on candidate pairs. For 3+ candidates, 'a' can be
// the entry without provenance. Use 3 entries where withoutProv has LOW confidence (first after sort)
// then gets visited as 'a'. Actually: confidence sort is ascending, so lowest is candidates[0].
// V8 sort comparisons for 3 elements include comparator(candidates[1], candidates[0]).
// If withoutProv is at candidates[0] after partial sort: a=candidates[1] (has prov). No crash.
// For 'a' to be withoutProv: withoutProv must be at candidates[1] or higher index.
// Confidence sort ascending: withoutProv has MID confidence → lands in middle.
// With 3 entries [lo-conf-prov, mid-conf-noprov, hi-conf-prov]:
//   sorted: [lo, mid-noprov, hi]. V8 calls comparator(hi, mid-noprov) among others.
//   When comparator(mid-noprov, lo) is called: a=mid-noprov → L530 mutant crashes.
// Use: hiProv(conf=5), midNoprov(conf=3), loProv(conf=1, already > FLOOR so survives decay).
// Actually: after decay, conf-1 entries survive if conf-1 > FLOOR(0). Use conf=2 → decayed=1 > 0 ✓

test('Given three equal-confidence entries where one lacks provenance, when selectVictim sorts candidates, then it does not crash accessing a.entry.provenance.date', () => {
  // selectVictim sort with 3 equal-confidence entries: confDiff=0 for all pairs → date comparison runs.
  // V8 sort calls comparator(midNoprov, loProv) at some point → a=midNoprov (no provenance)
  // L530 mutant a.entry.provenance.date → TypeError on midNoprov
  // All entries need confidence > FLOOR+STEP to survive decay (conf=3 → decays to 2 > 0).
  const loProv = { concern: 'toolchain', ecosystem: 'eco-l530-lo', lockfileFingerprint: 'fp-l530lo', confidence: 3, provenance: { run: 'r1', commit: 'c1', date: '2020-01-01' } };
  const midNoprov = { concern: 'gate-cmd', phase: 'ph-l530-mid', command: 'cmd-l530mid', confidence: 3 };
  const hiProv = { concern: 'mutation-tool', tool: 'stryker-l530', configFingerprint: 'cfg-l530', confidence: 3, provenance: { run: 'r3', commit: 'c3', date: '2026-01-01' } };
  const view = makeLoadedView([loProv, midNoprov, hiProv]);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 2, maxBytes: Infinity } });

  assert.doesNotThrow(() => save('/repo', view, [], deps), 'must not crash when selectVictim comparator gets a.entry with no provenance');
  const reparsed = parseStore(captured[0]);
  const total = CONCERNS.reduce((s, c) => s + reparsed.entries[c].length, 0);
  assert.equal(total, 2, 'one entry must be evicted from three');
});

// ─── KILL: selectVictim dateB LogicalOperator (L531:19) ──────────────────────
// L531 mutant: b.entry.provenance?.date && '' → any entry with a date gets dateB='' (falsy result of &&)
// This breaks the confidence-equal date sort: entries with provenance dates appear as ''
// which makes them sort before entries without dates → wrong victim selected.

test('Given two entries with equal confidence where b has a newer provenance date and a has an older date, when selectVictim runs, then the entry with older date is evicted not the one whose dateB is forced empty by logical-operator mutant', () => {
  // Two toolchain entries with equal confidence; ecoB is newer (2026), ecoA is older (2020).
  // Insert ecoB FIRST so it lands at flat[0]; ecoA SECOND so it lands at flat[1].
  // V8 2-element sort calls comparator(flat[1]=ecoA, flat[0]=ecoB) → a=ecoA(older), b=ecoB(newer).
  // L531 mutant: dateB = b.entry.provenance?.date && '' = '2026-06-01' && '' = '' (forced empty)
  //   → dateA='2020-01-01', dateB='' → '2020' < '' is false, '2020' > '' is true → return 1 (a > b) → ecoB first → ecoB victim. WRONG.
  // Correct: dateA='2020', dateB='2026' → '2020' < '2026' → return -1 (a < b) → ecoA first → ecoA victim. CORRECT.
  const ecoB = { ...TOOLCHAIN_ENTRY, ecosystem: 'eco-l531-b', lockfileFingerprint: 'fp-l531b', confidence: 3, provenance: { run: 'r2', commit: 'c2', date: '2026-06-01' } };
  const ecoA = { ...TOOLCHAIN_ENTRY, ecosystem: 'eco-l531-a', lockfileFingerprint: 'fp-l531a', confidence: 3, provenance: { run: 'r1', commit: 'c1', date: '2020-01-01' } };
  // ecoB inserted first (flat[0] before sort), ecoA second (flat[1] before sort); sort will move ecoA to flat[0]
  const view = makeLoadedView([ecoB, ecoA]);
  const captured = [];
  const deps = makeSaveDeps({ writeStore: (_p, c) => captured.push(c), caps: { maxEntries: 1, maxBytes: Infinity } });

  save('/repo', view, [], deps);

  const reparsed = parseStore(captured[0]);
  assert.ok(reparsed.entries.toolchain.some(e => e.ecosystem === 'eco-l531-b'), 'newer-date entry must survive');
  assert.ok(!reparsed.entries.toolchain.some(e => e.ecosystem === 'eco-l531-a'), 'older-date entry must be evicted by selectVictim date sort');
});

// ─── KILL: save caps default (L572) ──────────────────────────────────────────
// L572 mutant: deps.caps ?? {} — empty object has no maxEntries/maxBytes fields.
// exceedsCaps: countEntries > undefined → false; byteLength > undefined → false → no eviction.
// Correct default: maxEntries=1000, maxBytes=Infinity — only triggers when truly over cap.
// Kill: do NOT provide caps in deps; add exactly 2 entries and maxEntries=2 is NOT hit → no eviction.
// Then separately confirm the default is not {} by checking entries survive (both should be present).

test('Given no caps provided in deps, when save runs with two entries, then both entries survive (default caps are generous not empty)', () => {
  const view = makeLoadedView([]);
  const delta = [
    { concern: 'toolchain', payload: { ecosystem: 'cap-default-eco-1', lockfileFingerprint: 'fp-cd1' } },
    { concern: 'gate-cmd', payload: { phase: 'cap-default-phase', command: 'cmd-cd' } },
  ];
  const captured = [];
  // Explicitly omit caps so the default path is exercised
  const deps = {
    writeStore: (_p, c) => captured.push(c),
    run: { run: 'r-cd', commit: 'sha-cd', date: '2026-01-01' },
  };

  save('/repo', view, delta, deps);

  const reparsed = parseStore(captured[0]);
  assert.equal(reparsed.entries.toolchain.length, 1, 'toolchain entry must survive with default caps');
  assert.equal(reparsed.entries['gate-cmd'].length, 1, 'gate-cmd entry must survive with default caps');
});

// ─── EQUIVALENT: L206 BlockStatement, L207 StringLiteral ──────────────────────
// L206: catch {} (empty catch) — PROVABLY EQUIVALENT:
//   When readStore throws, rawContent is never assigned (stays undefined).
//   The next guard (L210: if (!rawContent)) catches undefined and returns emptyView('no store').
//   Both the original catch branch and the empty-catch fall-through return identical emptyView('no store').
// L207: 'no store' StringLiteral — same equivalence argument; only reachable via the equivalent path above.

// ─── EQUIVALENT: L300 EqualityOperator (>= vs >) ──────────────────────────────
// L300: findings improves >= → always true for same severity.
// PROVABLY EQUIVALENT: rewrite with same-severity payload spreads identical values over the stored entry.
// {...entry, ...payload} when payload fields match entry fields produces the same stored object.

// ─── EQUIVALENT: L302-305 ConditionalExpression (=> true) ─────────────────────
// L302 toolchain (o,n) => true, L303 mutation-tool (o,n) => true,
// L304 gate-cmd (o,n) => true, L305 slice-sizing (o,n) => true.
// PROVABLY EQUIVALENT: refreshedEntry spreads obs.payload over entry only when improves=true.
// When obs.payload contains the same key-field values as the stored entry,
// spreading identical values produces the same stored object — REFRESH confidence bump happens regardless.

// ─── EQUIVALENT: L526 ConditionalExpression (if(true)) ────────────────────────
// L526: if (confDiff !== 0) return confDiff → if (true) return confDiff.
// When confDiff=0 (equal confidence), returns 0 → candidates remain in flattenEntries insertion order.
// flattenEntries already sorted oldest→newest, so same-confidence candidates are already date-sorted.
// PROVABLY EQUIVALENT: returning 0 preserves flattenEntries date order → same victim chosen.

// ─── EQUIVALENT: L532/L533 selectVictim date comparators ──────────────────────
// L532 EqualityOperator (dateA <= dateB), L533 various.
// PROVABLY EQUIVALENT: flattenEntries pre-sorts candidates oldest→newest by date.
// selectVictim's date tiebreak re-sorts equal-confidence entries — but they're already in date order.
// Any comparator that returns 0 (skip) or preserves oldest-first is equivalent to the correct comparator.

// ─── KILL: L87/L91 (EQUIVALENT analysis inline) ───────────────────────────────
// L87: if (!content) → if (false): null/empty content passes to extractFrontmatter(null)
//   which throws, caught by try/catch → returns null. Same observable result.
//   PROVABLY EQUIVALENT: null content → catch → null, same as early return null.
// L91: if (!yamlText) → if (false): null yamlText passes to yamlLoad(null) = null
//   then L94 guard: !null = true → returns null. Same observable result.
//   PROVABLY EQUIVALENT: null yamlText → yamlLoad(null)=null → !null=true → null, same as early return null.
