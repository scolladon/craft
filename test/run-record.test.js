'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RUN_SKILL_PATH = path.join(ROOT, 'skills', 'run', 'SKILL.md');
const INTEGRATE_SKILL_PATH = path.join(ROOT, 'skills', 'integrate', 'SKILL.md');
const TEARDOWN_SCRIPT_PATH = path.join(ROOT, 'scripts', 'worktree-teardown.sh');
const RUN_RECORD_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md');

const LEDGER_PATH = '.claude/craft-run-record.md';
const STORE_PATH = '.claude/craft-memory.md';
const BUFFERED_FLUSH_SENTENCE =
  'Writes are buffered all run and flushed once here, so a phase that blocked mid-run leaves the store unchanged';

// Slices skills/run/SKILL.md between two `^## ` headings, so a mention in an
// unrelated section cannot satisfy a region-specific assertion. Lines are
// joined with a single space (not '\n') so a pinned sentence that word-wraps
// across markdown lines still matches as one contiguous phrase.
function sliceRegion(content, startPattern, endPattern) {
  const lines = content.split('\n');
  const startIdx = startPattern ? lines.findIndex((line) => startPattern.test(line)) : 0;
  const searchFrom = startPattern ? startIdx + 1 : 0;
  const relativeEnd = endPattern ? lines.slice(searchFrom).findIndex((line) => endPattern.test(line)) : -1;
  const endIdx = endPattern && relativeEnd !== -1 ? searchFrom + relativeEnd : lines.length;
  return lines.slice(startIdx === -1 ? 0 : startIdx, endIdx).join(' ');
}

const runSkill = fs.readFileSync(RUN_SKILL_PATH, 'utf8');

test('Given skills/run/SKILL.md §0, when the resolve region up to Phase walk is read, then it names the on-disk ledger path', () => {
  const result = sliceRegion(runSkill, null, /^## Phase walk/);

  assert.ok(result.includes(LEDGER_PATH), `expected ${LEDGER_PATH} in the §0 region`);
});

test('Given skills/run/SKILL.md phase walk step 7, when the record-outcome region is read, then it names the on-disk ledger path', () => {
  const result = sliceRegion(runSkill, /^## Phase walk/, /^## Cross-phase invariants/);

  assert.ok(result.includes(LEDGER_PATH), `expected ${LEDGER_PATH} in the phase-walk region`);
});

test('Given skills/run/SKILL.md §Done, when the done region is read, then it names the on-disk ledger path', () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  assert.ok(result.includes(LEDGER_PATH), `expected ${LEDGER_PATH} in the §Done region`);
});

test('Given skills/run/SKILL.md §Done, when read, then save(repoRoot, view, delta, deps) is still called exactly once, atomically', () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  assert.ok(result.includes('save(repoRoot, view, delta, deps)'));
  assert.ok(result.includes('**once**, atomically'));
});

test('Given skills/run/SKILL.md §Done, when read, then the buffered-and-flushed-once anti-regression sentence survives verbatim', () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  assert.ok(result.includes(BUFFERED_FLUSH_SENTENCE));
});

test("Given skills/run/SKILL.md §Done, when read, then the delta is derived from the ledger's lines carrying this run's run-id", () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  assert.ok(result.includes(LEDGER_PATH));
  assert.ok(/this run's run-id/i.test(result));
});

test('Given skills/run/SKILL.md §Done, when read, then the derivation is stated to happen before integrate runs the teardown script', () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  assert.ok(/before/i.test(result));
  assert.ok(result.includes('worktree-teardown.sh'));
});

test('Given the ledger and the memory store are distinct artifacts, when skills/run/SKILL.md is read, then both paths appear as separate literals', () => {
  assert.notStrictEqual(LEDGER_PATH, STORE_PATH);
  assert.ok(runSkill.includes(LEDGER_PATH));
  assert.ok(runSkill.includes(STORE_PATH));
});

test('Given the run-local ruling adds no ledger-preservation step, when scripts/worktree-teardown.sh is read, then it names neither the ledger file nor a ledger', () => {
  const result = fs.readFileSync(TEARDOWN_SCRIPT_PATH, 'utf8').toLowerCase();

  assert.ok(!result.includes('craft-run-record'));
  assert.ok(!result.includes('ledger'));
});

test('Given skills/integrate/SKILL.md step 3, when read, then it states the memory delta must already be derived before the teardown script runs', () => {
  const result = fs.readFileSync(INTEGRATE_SKILL_PATH, 'utf8');

  assert.ok(/derived/i.test(result));
  assert.ok(result.includes('run-record.md') || result.includes(LEDGER_PATH));
  assert.ok(/before/i.test(result));
});

test('Given docs/contributing/specs/run-record.md, when read, then it exists and is non-empty', () => {
  const result = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');

  assert.ok(result.length > 0);
});

test('Given the run-record spec, when read, then it documents the absent-file header case and the present-file append case', () => {
  const result = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');

  assert.ok(/absent/i.test(result) && /header/i.test(result));
  assert.ok(/append/i.test(result));
});

test('Given the run-record spec, when read, then it documents the run-id-collision edge', () => {
  const result = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');

  assert.ok(/collision/i.test(result));
});

test('Given the run-record spec, when read, then it documents the resume double-Done edge', () => {
  const result = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');

  assert.ok(/resume/i.test(result) && /Done/.test(result));
});
