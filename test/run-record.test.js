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
  // A missing boundary must fail loudly. Degrading to the whole file would turn
  // every region-scoped assertion below into a whole-file grep — passing for the
  // wrong reason the moment a heading is renamed.
  assert.notEqual(startIdx, -1, `region start ${startPattern} not found — heading renamed?`);
  const searchFrom = startPattern ? startIdx + 1 : 0;
  const relativeEnd = endPattern ? lines.slice(searchFrom).findIndex((line) => endPattern.test(line)) : -1;
  if (endPattern) {
    assert.notEqual(relativeEnd, -1, `region end ${endPattern} not found — heading renamed?`);
  }
  const endIdx = endPattern ? searchFrom + relativeEnd : lines.length;
  return lines.slice(startIdx, endIdx).join(' ');
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

  // Positive first: an empty or gutted script would satisfy the negatives below
  // without the negatives meaning anything.
  assert.ok(result.includes('worktree remove'), 'teardown must still remove the worktree');
  assert.ok(!result.includes('craft-run-record'));
  assert.ok(!result.includes('ledger'));
});

test('Given skills/integrate/SKILL.md step 3, when the step region is read, then it assigns the delta derivation as an action ahead of teardown', () => {
  const integrateSkill = fs.readFileSync(INTEGRATE_SKILL_PATH, 'utf8');

  const result = sliceRegion(integrateSkill, /^3\. \*\*Derive the /u, /^4\. /u);

  // Imperative, not a stated precondition: an orchestrator reading only this step
  // must know to perform the read, not merely that it should already have happened.
  assert.match(result, /read this\s+run's run-id lines from the on-disk ledger/u);
  assert.match(result, /into the in-session `delta` and hold it/u);
  assert.ok(result.includes('run-record.md'), 'step 3 must cite the ledger spec');
  // The derivation must precede the teardown invocation within this same region.
  assert.ok(
    result.indexOf('read this') < result.indexOf('worktree-teardown.sh'),
    'the imperative read must be stated before the teardown invocation',
  );
});

test('Given the run-record spec, when the absent-file section is read, then it pins the header line the orchestrator writes', () => {
  const spec = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');

  const shape = sliceRegion(spec, /^## File shape and header/u, /^## /u);
  const result = sliceRegion(spec, /^## The absent-file case/u, /^## /u);

  assert.ok(shape.includes('# craft run record (append-only)'),
    'the file-shape section must pin the exact header line');
  assert.match(result, /header line is appended first/u,
    'the absent-file section must state the header precedes the seeded lines');
});

test('Given the run-record spec, when the present-file section is read, then it states the append-never-rewrite rule', () => {
  const spec = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');

  const result = sliceRegion(spec, /^## The present-file case/u, /^## /u);

  assert.ok(result.includes('no header is re-written'), result);
  assert.ok(result.includes('`>>` semantics'), result);
});

test('Given the run-record spec, when the inherited-edges section is read, then the run-id-collision edge is documented there', () => {
  const spec = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');

  const result = sliceRegion(spec, /^## Inherited edges/u, /^## /u);

  assert.match(result, /collision/iu);
  // Both inherited edges live in this region; the earlier rewrite dropped this one.
  assert.match(result, /decay-merges against the run-start/u);
});
