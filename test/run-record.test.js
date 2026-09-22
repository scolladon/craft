'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RUN_SKILL_PATH = path.join(ROOT, 'skills', 'run', 'SKILL.md');
const INTEGRATE_SKILL_PATH = path.join(ROOT, 'skills', 'integrate', 'SKILL.md');
const TEARDOWN_SCRIPT_PATH = path.join(ROOT, 'scripts', 'worktree-teardown.sh');
const RUN_RECORD_SPEC_PATH = path.join(ROOT, 'docs', 'contributing', 'specs', 'run-record.md');

const LEDGER_PATH = '.claude/craft-run-record.md';
const STORE_PATH = '.claude/craft-memory.md';
const METRICS_LEDGER_PATH = path.join(ROOT, '.claude', 'craft-metrics.md');
const BUFFERED_FLUSH_SENTENCE =
  'Writes are buffered all run and flushed once here, so a phase that blocked mid-run leaves the store unchanged';
const FLUSH_PER_LINE =
  "appended in the tool call that produces it or in the orchestrator's very next tool call";
const NEW_TOKENS = [
  'RESOLVE:',
  'AWAITING(propose):',
  'PHASE-START(',
  'PHASE-DONE(',
  'PART(',
  'FINDINGS(',
  'HARNESS-BG(',
];
const RUN_SKILL_TOKENS = NEW_TOKENS.slice(0, 4);

const WORKSPACE_SKILL_PATH = path.join(ROOT, 'skills', 'workspace', 'SKILL.md');
const IMPLEMENTATION_SKILL_PATH = path.join(ROOT, 'skills', 'implementation', 'SKILL.md');
const REVIEW_SKILL_PATH = path.join(ROOT, 'skills', 'review', 'SKILL.md');
const VALIDATION_SKILL_PATH = path.join(ROOT, 'skills', 'validation', 'SKILL.md');

const PREAMBLE_OLD_WORDING = 'buffered to run record, flushed at run end';
const PREAMBLE_NEW_WORDING = 'appended to the run record as produced';
const PREAMBLE_SKILL_FILES = [
  'skills/workspace/SKILL.md',
  'skills/implementation/SKILL.md',
  'skills/review/SKILL.md',
  'skills/validation/SKILL.md',
];
const EMITTER_TOKENS = [
  ['PART(', 'skills/implementation/SKILL.md'],
  ['FINDINGS(', 'skills/review/SKILL.md'],
  ['HARNESS-BG(', 'skills/validation/SKILL.md'],
];

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
const runRecordSpec = fs.readFileSync(RUN_RECORD_SPEC_PATH, 'utf8');

test('Given skills/run/SKILL.md §0, when the resolve region up to Phase walk is read, then it names the on-disk ledger path', () => {
  const result = sliceRegion(runSkill, null, /^## Phase walk/);

  assert.ok(result.includes(LEDGER_PATH), `expected ${LEDGER_PATH} in the §0 region`);
});

test('Given skills/run/SKILL.md §0 step 4, when the open-record region is read, then it opens the ledger, flushes per line and seeds RESOLVE/AWAITING', () => {
  const result = sliceRegion(runSkill, /^4\. Open the \*\*run record\*\*/, /^## Phase walk/);

  assert.match(result, /run-ledger\.sh"? open <run-id>/);
  assert.ok(result.includes(FLUSH_PER_LINE), 'expected the flush-per-line sentence');
  assert.ok(result.includes('RESOLVE:'), 'expected the RESOLVE: token');
  assert.ok(result.includes('AWAITING(propose):'), 'expected the AWAITING(propose): token');
  assert.ok(!result.includes('buffer the lines in-session'), 'the pre-worktree buffer wording must be gone');
});

test('Given the run-record spec, when normalised, then it states the flush-per-line rule and drops the buffered/phase-boundary wording', () => {
  const normalised = runRecordSpec.replace(/\s+/g, ' ');

  assert.ok(normalised.includes(FLUSH_PER_LINE), 'expected the flush-per-line sentence');
  assert.ok(!normalised.includes('buffered in-session'), 'the buffered-in-session wording must be gone');
  assert.ok(!normalised.includes('once per phase boundary'), 'the phase-boundary cadence wording must be gone');
});

test('Given skills/run/SKILL.md phase walk step 7, when the record-outcome region is read, then it names the on-disk ledger path', () => {
  const result = sliceRegion(runSkill, /^## Phase walk/, /^## Cross-phase invariants/);

  assert.ok(result.includes(LEDGER_PATH), `expected ${LEDGER_PATH} in the phase-walk region`);
});

test('Given skills/run/SKILL.md phase walk step 4, when the assemble region is read, then it appends a PHASE-START marker at phase entry', () => {
  const result = sliceRegion(runSkill, /^4\. \*\*Assemble the injected block\*\*/, /^5\. \*\*Execute\*\*/);

  assert.ok(result.includes('PHASE-START(<phase.id>):'));
});

test('Given skills/run/SKILL.md phase walk step 7, when the record-outcome region is read, then it appends a PHASE-DONE marker and drops the phase-boundary-flush wording', () => {
  const result = sliceRegion(runSkill, /^7\. \*\*Record outcome\*\*/, /^8\. \*\*On blocker\*\*/);

  assert.ok(result.includes('PHASE-DONE(<phase.id>):'));
  assert.ok(!result.includes('phase-boundary flush'));
});

test('Given the run-record spec, when the token-vocabulary region is read, then it names every new ledger token', () => {
  const result = sliceRegion(runRecordSpec, /^## Token vocabulary/, /^## /);

  for (const token of NEW_TOKENS) {
    assert.ok(result.includes(token), `expected ${token} in the Token vocabulary region`);
  }
});

test('Given skills/run/SKILL.md, when scanned whole, then it carries every run-skill-emitted ledger token', () => {
  for (const token of RUN_SKILL_TOKENS) {
    assert.ok(runSkill.includes(token), `expected ${token} in skills/run/SKILL.md`);
  }
});

test('Given the run-record spec, when read, then it names the run directory and the compaction-survival hooks', () => {
  assert.ok(runRecordSpec.includes('.claude/craft-runs/'), 'expected the run directory path');

  const result = sliceRegion(runRecordSpec, /^## Compaction survival/, /^## /);
  assert.ok(result.includes('hooks/reorient-after-compact.sh'));
  assert.ok(result.includes('hooks/steer-compact-summary.sh'));
});

test('Given skills/run/SKILL.md §Done, when the done region is read, then it names the on-disk ledger path', () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  assert.ok(result.includes(LEDGER_PATH), `expected ${LEDGER_PATH} in the §Done region`);
});

test('Given skills/run/SKILL.md, when scanned for section order, then Rebuild after compaction sits between Review cadence and Done', () => {
  const reviewIdx = runSkill.indexOf('## Review cadence — engine vs working-style');
  const rebuildIdx = runSkill.indexOf('## Rebuild after compaction');
  const doneIdx = runSkill.indexOf('## Done');

  assert.ok(reviewIdx !== -1 && rebuildIdx !== -1 && doneIdx !== -1, 'all three headings must exist');
  assert.ok(reviewIdx < rebuildIdx && rebuildIdx < doneIdx, 'Rebuild after compaction must sit between the other two');
});

test('Given skills/run/SKILL.md, when the Rebuild-after-compaction section is read, then it names the run-state derivation, the locate fallback and the resume table', () => {
  const result = sliceRegion(runSkill, /^## Rebuild after compaction/, /^## Done/);

  assert.ok(result.includes('run-state.js'));
  assert.ok(result.includes('locate --run'));
  assert.ok(result.includes('RESOLVE:'));
  assert.ok(result.includes('inFlight'));
  assert.match(result, /\|\s*`review`/);
});

test('Given skills/run/SKILL.md §Done, when read, then it reads the delta from the on-disk delta file, closes the run ledger and drops the residual-flush wording', () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  assert.ok(result.includes('.delta.json'));
  assert.ok(result.includes('run-ledger.sh close'));
  assert.ok(result.includes('PHASE-START('));
  assert.ok(!result.includes('residual flush'));
});

test('Given the run-record spec, when read, then it carries no residual-flush wording', () => {
  assert.ok(!runRecordSpec.includes('residual flush'));
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
  assert.match(result, /write it[^.]*<run-id>\.delta\.json/u);
  assert.ok(result.includes('run-record.md'), 'step 3 must cite the ledger spec');
  // The read, the delta write and the teardown invocation must stay in that order.
  assert.ok(
    result.indexOf('read this') < result.indexOf('.delta.json') &&
      result.indexOf('.delta.json') < result.indexOf('worktree-teardown.sh'),
    'the read, the delta write and the teardown invocation must stay in that order',
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

test('Given skills/run/SKILL.md §Done, when the metrics procedure is read, then it names the emitter wrapper and the run-id flag', () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  assert.ok(result.includes('scripts/emit-metrics.sh'), 'expected the emitter wrapper to be named');
  assert.ok(result.includes('--run'), 'expected the --run flag to be named');
});

test('Given skills/run/SKILL.md §Done, when the metrics procedure is read, then it carries no instruction to locate, open or fold a sub-agent transcript', () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  for (const term of ['subagents/', 'toolUseId', 'message.id']) {
    assert.ok(!result.includes(term), `expected no "${term}" in the §Done region`);
  }
});

test('Given skills/run/SKILL.md §Done, when the metrics procedure is read, then it states the re-run obligation for a phase that ran twice in one session', () => {
  const result = sliceRegion(runSkill, /^## Done/, null);

  assert.ok(result.includes('--phase'), 'expected the --phase flag to be named');
  assert.ok(result.includes('--since'), 'expected the --since flag to be named');
  assert.match(result, /re-counts the first/i);
});

// The ledger is append-only and a further format change is expected, so the
// marker COUNT and today's date are not the invariant — a test pinning them
// fails later for being right. What must hold is that the newest boundary
// states which columns changed and forbids comparison across itself.
test('Given the metrics ledger, when its newest format boundary is read, then it names the changed columns and forbids comparison across itself', () => {
  const ledger = fs.readFileSync(METRICS_LEDGER_PATH, 'utf8');
  const markers = ledger.split('\n').filter((line) => line.startsWith('--- format boundary'));

  assert.ok(markers.length >= 1, 'a ledger whose row format has changed must carry a boundary marker');
  const newest = markers[markers.length - 1];
  assert.match(newest, /\d{4}-\d{2}-\d{2}/, 'the boundary states when the format changed');
  assert.match(newest, /turns, tool_calls, output, avg_ctx and equiv/);
  assert.match(newest, /[Nn]ever compare a row above this line to a row below/);
});

for (const file of PREAMBLE_SKILL_FILES) {
  test(`Given ${file}, when the memory read/write preamble is read, then WRITES is stated as appended-as-produced, not buffered-to-run-end`, () => {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');

    assert.ok(!content.includes(PREAMBLE_OLD_WORDING), `expected no buffered-to-run-end wording in ${file}`);
    assert.ok(content.includes(PREAMBLE_NEW_WORDING), `expected the appended-as-produced wording in ${file}`);
  });
}

test('Given skills/workspace/SKILL.md procedure step 2, when the worktree-strategy region is read, then worktree-setup runs before the ledger move inside one fenced block', () => {
  const workspaceSkill = fs.readFileSync(WORKSPACE_SKILL_PATH, 'utf8');
  const result = sliceRegion(workspaceSkill, /^2\. \*\*Consult `isolate` action\*\*/, /^3\. /);

  const fenceStart = result.indexOf('```');
  const fenceEnd = result.indexOf('```', fenceStart + 3);
  assert.notStrictEqual(fenceStart, -1, 'expected a fenced code block in step 2');
  assert.notStrictEqual(fenceEnd, -1, 'expected the fenced code block to close');
  const fenced = result.slice(fenceStart, fenceEnd);

  assert.ok(fenced.includes('worktree-setup.sh'), 'expected worktree-setup.sh inside the fenced block');
  assert.ok(fenced.includes('run-ledger.sh" move <run-id>'), 'expected the ledger move inside the fenced block');
  assert.ok(
    fenced.indexOf('worktree-setup.sh') < fenced.indexOf('run-ledger.sh" move <run-id>'),
    'worktree-setup.sh must precede the ledger move',
  );
});

test('Given skills/implementation/SKILL.md, when scanned for the PART ledger token, then it names the full literal shape', () => {
  const content = fs.readFileSync(IMPLEMENTATION_SKILL_PATH, 'utf8');

  assert.ok(content.includes('PART(<n>): <sha> size=<size> outcome=<pass|blocked>'));
});

test('Given skills/review/SKILL.md, when scanned for the FINDINGS ledger token, then it names the full literal shape plus the out-of-tree dir and the respawn rule', () => {
  const content = fs.readFileSync(REVIEW_SKILL_PATH, 'utf8');

  assert.ok(content.includes('FINDINGS(<dimension>): c<cycle> <path> n=<count>'));
  assert.ok(content.includes('mktemp -d'));
  assert.ok(content.includes('re-spawned'));
});

test('Given skills/validation/SKILL.md, when scanned for the HARNESS-BG ledger token, then it names the pid shape', () => {
  const content = fs.readFileSync(VALIDATION_SKILL_PATH, 'utf8');

  assert.ok(content.includes('HARNESS-BG(<phase>:<technique-id>): pid=<pid>'));
});

for (const [tokenPrefix, file] of EMITTER_TOKENS) {
  test(`Given ${file}, when scanned for its ledger-token emitter prefix, then ${tokenPrefix} appears`, () => {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');

    assert.ok(content.includes(tokenPrefix), `expected ${tokenPrefix} in ${file}`);
  });
}

test('Given skills/*/SKILL.md, when scanned for the retired flushed-at-run-end wording, then none remain', () => {
  let result;
  try {
    result = execFileSync('grep', ['-rl', 'flushed at run end', path.join(ROOT, 'skills')], {
      encoding: 'utf8',
    });
  } catch (err) {
    result = err.stdout ?? '';
  }

  assert.strictEqual(result.trim(), '', `expected no file to carry 'flushed at run end':\n${result}`);
});
