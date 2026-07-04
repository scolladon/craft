/**
 * In-process unit tests for the tune-plan entrypoint: reads a base named-config +
 * report.json (+ optional memory), delegates the decision to planTune, and emits
 * { proposals, patchedManifest, hasPatch } as JSON. STOP semantics on absent report
 * or base config. Injected readFileSync so these tests never touch a real filesystem.
 * Given/When/Then titles, Arrange-Act-Assert bodies, sut variable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/tune-plan-main.js';
import { parseManifestContent } from '../src/frontmatter.js';
import { makeCaptureIo } from '../test-helpers/capture-io.js';

const MEMORY_STORE = `---\nfindings:\n  - concern: findings\n    file: skills/x.md\n    pattern: recurring thing\n    confidence: 0.8\n---\n\n# memory\n`;

function occurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

const BASE = '.claude/craft-ci.md';
const REPORT = 'report.json';

const BASE_CONFIG = `---\nmodels:\n  planner: model-a\n---\n\n# Craft customization\n\nCustomize the craft workflow for this repo.\n`;

function routingReportJson() {
  return JSON.stringify({
    schemaVersion: 1,
    runs: [{
      run: 'r1', slug: 's',
      groups: [
        { phase: 'review', role: 'reviewer', model: 'model-a', tokens: {}, cost: { priced: 100 }, cacheEfficiency: 0 },
        { phase: 'review', role: 'reviewer', model: 'model-b', tokens: {}, cost: { priced: 20 }, cacheEfficiency: 0 },
      ],
      reviewCycles: [],
    }],
    recommendations: [{
      kind: 'model-routing', run: 'r1', phase: 'review', role: 'reviewer', model: 'model-a',
      detail: 'consider model-b', evidence: { currentModel: 'model-a', currentPricedCost: 100, candidateModel: 'model-b', projectedPricedCost: 20 },
    }],
  });
}

function fakeFs(map) {
  return (path) => {
    if (!(path in map)) { const e = new Error(`ENOENT ${path}`); throw e; }
    return map[path];
  };
}

// ── STOP semantics ────────────────────────────────────────────────────────────

test('Given no arguments, when main runs, then it fails with a usage message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const code = sut([], io, { readFileSync: fakeFs({}) });

  assert.notEqual(code, 0);
  assert.ok(io.stderr.joined().includes('usage'));
});

test('Given only the base path (report argument missing), when main runs, then it fails with a usage message', () => {
  const sut = main;
  const io = makeCaptureIo();

  const code = sut([BASE], io, { readFileSync: fakeFs({ [BASE]: BASE_CONFIG }) });

  assert.notEqual(code, 0);
  assert.ok(io.stderr.joined().includes('usage'));
});

test('Given an unreadable report, when main runs, then it fails and points at craft:metrics', () => {
  const sut = main;
  const io = makeCaptureIo();

  const code = sut([BASE, REPORT], io, { readFileSync: fakeFs({ [BASE]: BASE_CONFIG }) });

  assert.notEqual(code, 0);
  assert.ok(io.stderr.joined().includes('metrics'));
});

test('Given an unreadable base config, when main runs, then it fails naming the base config', () => {
  const sut = main;
  const io = makeCaptureIo();

  const code = sut([BASE, REPORT], io, { readFileSync: fakeFs({ [REPORT]: routingReportJson() }) });

  assert.notEqual(code, 0);
  assert.ok(io.stderr.joined().includes('base config'));
});

// ── happy path ────────────────────────────────────────────────────────────────

test('Given a base config and a routing report, when main runs, then stdout carries proposals, a patched manifest, and hasPatch true', () => {
  const sut = main;
  const io = makeCaptureIo();

  const code = sut([BASE, REPORT], io, { readFileSync: fakeFs({ [BASE]: BASE_CONFIG, [REPORT]: routingReportJson() }) });

  assert.equal(code, 0, io.stderr.joined());
  const out = JSON.parse(io.stdout.joined());
  assert.equal(out.hasPatch, true);
  assert.ok(out.proposals.some(p => p.source === 'model-routing'));
  assert.ok(out.patchedManifest.includes('reviewer: model-b'), out.patchedManifest);
  assert.ok(out.patchedManifest.includes('# Craft customization'), 'base prose must be preserved');
});

test('Given a report with no actionable signal, when main runs, then hasPatch is false', () => {
  const sut = main;
  const io = makeCaptureIo();
  const emptyReport = JSON.stringify({ schemaVersion: 1, runs: [], recommendations: [] });

  const code = sut([BASE, REPORT], io, { readFileSync: fakeFs({ [BASE]: BASE_CONFIG, [REPORT]: emptyReport }) });

  assert.equal(code, 0);
  const out = JSON.parse(io.stdout.joined());
  assert.equal(out.hasPatch, false);
});

test('Given an unreadable memory path, when main runs, then it still succeeds (memory is advisory)', () => {
  const sut = main;
  const io = makeCaptureIo();

  const code = sut([BASE, REPORT, '--memory', '.claude/craft-memory.md'], io, {
    readFileSync: fakeFs({ [BASE]: BASE_CONFIG, [REPORT]: routingReportJson() }),
  });

  assert.equal(code, 0, io.stderr.joined());
});

// ── structural round-trip + memory wiring (mutation hardening) ────────────────

test('Given a routing report, when main patches the config, then the emitted manifest round-trips to the merged frontmatter with the base prose preserved exactly once', () => {
  const sut = main;
  const io = makeCaptureIo();

  sut([BASE, REPORT], io, { readFileSync: fakeFs({ [BASE]: BASE_CONFIG, [REPORT]: routingReportJson() }) });

  const { patchedManifest } = JSON.parse(io.stdout.joined());
  assert.deepEqual(parseManifestContent(patchedManifest), { models: { planner: 'model-a', reviewer: 'model-b' } });
  assert.equal(occurrences(patchedManifest, 'planner: model-a'), 1, 'the base frontmatter must not be duplicated into the prose body');
  assert.equal(occurrences(patchedManifest, '# Craft customization'), 1, 'the base prose must appear exactly once');
  assert.match(patchedManifest, /# Craft customization\n\nCustomize the craft workflow/, 'the prose body is emitted verbatim, newlines intact');
  assert.ok(patchedManifest.includes('Tuned'), 'the tuned note must be appended');
});

test('Given a readable memory store with a high-confidence finding, when main runs with --memory, then a memory advisory is surfaced', () => {
  const sut = main;
  const io = makeCaptureIo();
  const memPath = '.claude/craft-memory.md';

  sut([BASE, REPORT, '--memory', memPath], io, {
    readFileSync: fakeFs({ [BASE]: BASE_CONFIG, [REPORT]: routingReportJson(), [memPath]: MEMORY_STORE }),
  });

  const { proposals } = JSON.parse(io.stdout.joined());
  assert.ok(proposals.some(p => p.source === 'memory'), 'a memory advisory must appear when the store has a high-confidence finding');
});
