# Plan — planning-no-op-outcome

> Source: design doc `docs/contributing/design/planning-no-op-outcome.md` · ADRs 636, 637, 638, 639
> The plan is the implementation script AND the knowledge handoff. Part agents start
> with zero context: whatever a part block omits is paid later as agent rediscovery.
> `plan-lint.sh` enforces the schema below — the plan phase cannot close without it.

## Sizing rules

- Every part costs a full agent lifecycle (spin-up, zero-context rebuild, gate) — it
  must earn it. No standalone test-only parts for FEATURE code: coverage/interop/property
  tests fold into the implementation part whose code they exercise. EXCEPTION:
  test-infra-only and docs-only parts (tooling config, test helpers, fixtures,
  harness/ADV/property suites, docs/prose) with no `src/` delta ARE standalone — they
  have no implementation part to fold into.
- A part that would be a pure test pass over already-landed code merges into its
  neighbour.
- A part should land in ~100 tool calls. More than ~5 RED→GREEN cycles, or more than 6
  files in its `### Context` block, is two parts. What counts is a backticked path:
  backtick the files the part CREATES or EDITS, and write read-only reference paths in
  plain text.

## Plan shape (2 parts)

| Part | Delivers | Files (create/edit) | RED cycles |
|---|---|---|---|
| 1 | Planning declares the no-op: planner contract, planning Procedure no-op branch with sha checks, mirrors, the run-record spec bullet naming both fixed idioms | 5 (mirror glob counts as one) | 3 |
| 2 | Implementation counterpart: Preamble 2 branch, run skill walk step 1 / step 7 / resume row, engine characterisation GUARDs + fixture | 5 | 4 + 2 GUARDs |

Engine `src/`, `pipeline/default.yml` and plan-lint are NOT changed (design R9). Both parts
are prose + pins: each part pairs its RED pins with the prose that greens them. The engine
GUARDs ride in Part 2 because they characterise exactly the ledger shape Part 2's prose
emits; alone they would be a test-only part.

Both parts append to test/no-op-token.test.js (plan-lint reports a shared-file overlap
warning; it is advisory and expected).

## Public-surface decision

No new exported symbol, command, barrel entry or registry row. The two idioms are prose
conventions of the existing generic `NO-OP(<phase>):` token (public, already documented);
they become greppable-only bullets in the run-record spec, never a regex row and never a
`run-state` field. The planner's new final-message form is internal to the
planner/planning-skill contract.

## Decision candidates

None. Every load-bearing choice is ratified by ADR 636 to ADR 639 (candidates 1(b) and 2(b)
of the design). Details the design left implicit are fixed here, not by a decision:

- The run-record spec bullet (both idioms) lands in Part 1, so Part 1's commit names the
  implementation idiom one commit before Part 2 adds its emitter. The branch squash-merges,
  so main never sees the gap; splitting the bullet across parts would cost a second edit of
  the same bullet for no reader.
- The implementation Preamble runs `gates.phase` itself on the no-op branch (worded as "the
  Procedure 3 gate") rather than "run Procedure 3", because a manifest `override:` replaces
  the Procedure and the guard must not depend on it.
- The resume-row pin slices the single table row with `sliceRegion` (raw lines) between the
  `implementation` row and the `review` row of the resume table; both rows are unique start
  anchors after line 545 (the `review` row at line 223 lies before the start and is never
  searched).

## Validation-phase notes

- No `engine/src/` delta: the mutation technique has no mutable code in scope, so validation
  is expected to auto-skip / no-op on the "no mutable code changed" signal.
- The architecture boundaries technique (test/architecture-boundaries.test.js) is untouched
  by both parts.

## Part 1 — Planning declares a sha-verified NO-OP(planning)

### Context

**What changes.** The planner may return a no-op instead of a plan when every design
requirement is already delivered by a commit on the branch. The planning skill's Procedure
gains a no-op branch ahead of plan-lint: it checks every cited sha with two
`merge-base --is-ancestor` probes, then appends `NO-OP(planning): no part remains — …` with
`PHASE-DONE(planning): no-op — no part remains` in one ledger call. No plan file, no commit.
The run-record spec gains one greppable-only bullet naming both fixed idioms.

**Files edited / created.**

- `skills/planning/SKILL.md` — `## Procedure` items 2 (lines 33-35) and 3 (lines 36-37).
  Item 1 (spawn) is unchanged. Exact replacement text is in TDD step 4.
- `agents/planner.md` — the last Contract bullet, line 43, reads
  "- Final message: the plan path + part count, nothing else." Replacement in TDD step 6.
- `adapters/*/agents/craft-planner.md` — six byte-synced mirrors (aider, antigravity,
  codex, copilot, cursor, opencode). Never hand-edit: regenerate with
  scripts/sync-adapter-agents.sh run with `--write` after editing agents/planner.md (the
  mirrors carry their own frontmatter; the body below it is copied). scripts/static-lints.sh
  line 16 runs the `--check` form inside ci.sh (today: "54 mirrors in sync across 6
  adapters").
- `docs/contributing/specs/run-record.md` — append one bullet to the greppable-only list
  ("The tokens below are greppable only: …", line 94). The list's last bullet is the
  `FILED(<file>): …` bullet, lines 139-145; the new bullet goes right after line 145, before
  the blank line and the `## Compaction survival` heading (line 147). Text in TDD step 8.
- `test/no-op-token.test.js` — CJS suite (42 lines, 7 tests, `ROOT` = repo root,
  `fs.readFileSync(path.join(ROOT, …), 'utf8')`). Add
  `const { TO_END, sliceProse } = require('./helpers/region-slice');` after the
  `path` require. sliceProse(content, startRegExp, endRegExpOrSentinel) from
  test/helpers/region-slice.js collapses whitespace runs to one space, so a sentence that
  wraps across markdown lines matches as one phrase; a missing boundary throws (an
  `assert.notEqual` "region start … not found").

**Pinned bytes that must not move.**

- test/craft-root-shim.test.js pins `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/` occurrence
  counts per file: skills/planning/SKILL.md = **2** (item 1 template path + item 2
  plan-lint path). The new prose must keep exactly those two — write `run-ledger.sh append`
  bare, never with the shim prefix. No bare `${CLAUDE_PLUGIN_ROOT}/` either.
- test/run-record.test.js slices the spec from `## Token vocabulary` to the next `## `
  and requires the seven token prefixes; the new bullet sits inside that region and adds
  no new `## ` heading.
- Existing no-op-token tests keep passing (no edits to the decisions/refactoring/validation/
  architecture skills).

**Conventions.** No ADR or backlog numbers in the edited skill/agent prose (planning skill
and planner carry none today) nor in test code. Test titles printable ASCII only (no em
dash, no arrow); em dash and arrow are fine inside asserted strings. Given/When/Then
titles, AAA body, `const sut = sliceProse;` or `const sut = fs.readFileSync` style matching
test/run-record.test.js (which binds `const result = sliceProse(...)` directly — either is
accepted in this file; prefer a `sut` binding for new tests). skills/, agents/ and
adapters/ markdown is prose-linted by ci.sh (advisory gate): avoid the ban-list words
(delve, leverage, seamless, robust, "it's important to note", "in conclusion").

**Edge behaviour to state in prose** (from the design): any doubt produces a plan; a partly
landed requirement still gets a part; a cited sha that predates the run fails the base
check; standalone `/craft:planning` reports the planner's line and stops; the sizing step
is skipped on the no-op branch.

### TDD steps

1. **RED — planning skill names the idiom.** In test/no-op-token.test.js add
   `Given the planning skill, when read whole, then it names the NO-OP(planning) no part remains idiom`:
   read skills/planning/SKILL.md, assert `content.includes('NO-OP(planning): no part remains — ')`.
   Fails: the planning skill has no no-op path; the literal is absent.
2. **RED — planning Procedure verifies every sha.** Add
   `Given the planning skill Procedure, when the no-op branch is read, then it checks each cited sha against HEAD and base with merge-base is-ancestor`:
   `const result = sliceProse(content, /^## Procedure/, TO_END);` assert it includes
   `git merge-base --is-ancestor <sha> HEAD` AND `git merge-base --is-ancestor <sha> <base>`.
   Fails: the Procedure goes straight to plan-lint; neither probe is present.
3. **RED — planner allows the no-op return.** Add
   `Given the planner agent, when its final-message contract is read, then it allows the NO-OP no part remains return`:
   read agents/planner.md, `sliceProse(content, /^- Final message:/, TO_END)`, assert it
   includes `NO-OP: no part remains — `. Fails: the final-message line allows only "the plan
   path + part count, nothing else".
4. **GREEN — planning skill.** Replace Procedure items 2-3 (lines 33-37) with exactly:

   ~~~
   2. When it returns: a final message starting `NO-OP: no part remains — ` takes the
      **no-op branch** below; any other return runs
      `"${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/plan-lint.sh" <plan-path>` —
      **the phase cannot close red**. On failure, respawn fresh with the lint output; ≤2
      respawns, then escalate.

      **No-op branch** (every design requirement is already delivered by a commit on the
      branch; no plan file exists, so plan-lint is not run). For every sha the planner
      cites, with `<base>` the branch the run's worktree was cut from:
      `git merge-base --is-ancestor <sha> HEAD` must succeed (the sha is on the branch) and
      `git merge-base --is-ancestor <sha> <base>` must fail (the sha landed this run, not
      before it). Any failing sha: respawn fresh with the failing shas — the same ≤2
      respawns — then escalate `{ planning, reason, ≤3 options }`. All pass: append
      `NO-OP(planning): no part remains — <justification>` (the planner's requirement → sha
      list verbatim) and `PHASE-DONE(planning): no-op — no part remains` in one
      `run-ledger.sh append <run-id> planning` call (walk step 7). Commit nothing.
      Standalone (no open run): report the planner's line and stop — there is no ledger to
      receive it and no commit.
   3. Read the plan; verify part sizing (no test-only parts) and that part contexts
      reference real files/symbols (spot-check). Record in the run record. Skipped on the
      no-op branch: there are no parts.
   ~~~

   Steps 1-2 pass. Shim count stays 2.
5. **GUARD.** `node --test test/craft-root-shim.test.js` passes (planning count still 2).
6. **GREEN — planner.** Replace line 43 of agents/planner.md with exactly:

   ~~~
   - No-op: when every design requirement (and every ADR consequence the design commits
     to) is already delivered by a commit on the branch, write no plan and commit
     nothing. Any doubt produces a plan; a requirement that is only partly landed still
     gets a part.
   - Final message: the plan path + part count, nothing else — or, on a no-op, exactly
     `NO-OP: no part remains — <R1 → <sha>, R2 → <sha>, …>`.
   ~~~

   Then run scripts/sync-adapter-agents.sh with `--write`, and its `--check` form prints
   "54 mirrors in sync across 6 adapters". Step 3 passes.
7. **RED — spec names both idioms.** Add
   `Given the run-record spec, when the greppable-only list is read, then it names both fixed no-op idioms`:
   read docs/contributing/specs/run-record.md,
   `sliceProse(content, /^The tokens below are greppable only/, /^## /)`, assert it includes
   `NO-OP(planning): no part remains — <justification>` AND
   `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)`.
   Fails: the greppable-only list has no NO-OP idiom bullet.
8. **GREEN — spec bullet.** Insert after line 145 (end of the `FILED` bullet) exactly:

   ~~~
   - `NO-OP(planning): no part remains — <justification>` and
     `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)` — the two
     fixed reason idioms of the generic `NO-OP(<phase>):` token for a run whose earlier
     phases already landed every deliverable. The first is emitted by the `planning`
     procedure's no-op branch once every cited sha is on the branch and after `<base>`;
     `<justification>` maps each design requirement to the commit that delivered it
     (`R1 → <sha>, R2 → <sha>, …`). The second is emitted by the `implementation`
     preamble when no plan exists and the run record holds the first. Each is appended in
     one call with its phase's `PHASE-DONE` line; `run-state` consumes only the generic
     prefix.
   ~~~

   Step 7 passes.
9. **REFACTOR.** Re-read the three prose edits for duplicated wording; none of the pins
   may move. No code to refactor.

### Gate

```
node --test test/no-op-token.test.js test/craft-root-shim.test.js test/run-record.test.js
bash scripts/sync-adapter-agents.sh --check
bash scripts/ci.sh
```

### Commit

`feat(planning): add the sha-verified NO-OP(planning) outcome`

## Part 2 — Implementation counterpart and run-walk wiring

### Context

**What changes.** Implementation Preamble 2 accepts "no plan" when the run record holds
`NO-OP(planning):`: it spawns nothing, appends no `PART` line, still runs `gates.phase` once,
and records `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)` +
`GATE(implementation): <green|red>` + `PHASE-DONE(implementation): no-op — no plan parts` in
one append. The run skill: walk step 1 widens the downstream necessity probes to
`<base>...HEAD` after an implementation no-op; walk step 7 lists both no-ops as produced
outcomes; the resume table's `implementation` row covers the no-plan cut. Engine GUARDs pin
that `deriveRunState` already reads this ledger correctly (engine src unchanged).

Part 1 already landed: the planning no-op branch, the planner's `NO-OP: no part remains — …`
return, and the run-record spec bullet naming both idioms (do not edit the spec again).

**Files edited / created.**

- `skills/implementation/SKILL.md` — `## Preamble` item 2, line 15, reads exactly
  "2. The plan must exist and pass plan-lint.sh (re-run it; cheap)." (plan-lint.sh is
  backticked in the source). Replacement in TDD
  step 3. Items 1 and 3 and the whole `## Procedure` stay byte-identical (Procedure 3,
  lines 46-48, is the phase-boundary gate the no-op branch borrows).
- `skills/run/SKILL.md` — three edits, all inside `## Phase walk` / `## Rebuild after
  compaction`:
  - walk step 1 (starts line 216, "1. **Necessity probe (auto-skip).**"): the signal
    table ends at line 228 (`architecture` row); insert a paragraph after line 228's blank
    line, before line 230 "   When provably empty: …". Text in TDD step 7.
  - walk step 7 (starts line 359, "7. **Record outcome**"; ends before line 381
    "8. **On blocker**"): its last sentence (lines 376-379) is the `NO-OP(verify)`
    sentence ending "escalates as a gap."; append the new sentence after it. Text in TDD
    step 5.
  - resume table (in `## Rebuild after compaction`, line 545; table rows at 577-584): the
    `implementation` row is line 580, ending "Continue at the first part with neither. |".
    Append a clause before the closing ` |`. Text in TDD step 9.
- `test/no-op-token.test.js` — the CJS suite Part 1 extended (it already requires
  `TO_END` and `sliceProse` from ./helpers/region-slice); add `sliceRegion` to that
  destructure for the resume-row pin.
- `engine/test/run-state.test.js` — ESM, node:test + node:assert/strict. Reuse its
  helpers: `RUN_ID = 'demo'`, `DEFAULT_RESOLUTION` (default 11 ids, awaiting
  `['validation']`), `readFixture(name)` (reads fixtures/run-ledger/<name>, split on
  `\n`), `deriveRunState` imported from ../src/run-state.js. Result shape:
  `result.kind === 'state'`, `result.state.{completed, inFlight, next, awaitingHarnesses,
  parts, warnings}`; `inFlight` entries are `{ phase, since }`. Append the two new tests at
  the end of the file (474 lines today).
- `engine/test/fixtures/run-ledger/planning-no-op.md` — new fixture; exact bytes in TDD
  step 11. Other fixtures in that directory follow the same `<run-id> <phase> <record>`
  line shape (mid-review.md is the model). engine/test/run-state-main.test.js reads only
  mid-review.md from that directory, nothing enumerates it.

**Line numbers** below are as of the tree before this part. Step 5 inserts 5 lines at
skills/run/SKILL.md line 379 and step 7 inserts 6 lines after line 228, so by step 8 the
resume row (line 580 here) sits about 11 lines lower: locate it by its content, never by
number.

**Pinned behaviour (probed against this tree with the exact fixture of step 11).**

| Input | completed | inFlight | next | awaitingHarnesses | parts | warnings |
|---|---|---|---|---|---|---|
| full fixture | workspace, design, decisions, planning, implementation | `[]` | review | `['validation']` | `[]` | `[]` |
| fixture lines through the `PHASE-START(implementation)` line | workspace, design, decisions, planning | `[{ phase: 'implementation', since: '2026-10-18T10:12:00Z' }]` | review | `['validation']` | n/a | `[]` |

**Pinned bytes that must not move.**

- test/craft-root-shim.test.js counts `${CRAFT_ROOT:-${CLAUDE_PLUGIN_ROOT}}/`:
  skills/implementation/SKILL.md = **1**, skills/run/SKILL.md = **13**. Write
  `run-ledger.sh append` bare in new prose.
- test/run-record.test.js: walk step 7 must keep `PHASE-DONE(<phase.id>):` and must not
  contain "phase-boundary flush"; the Rebuild section must keep run-state.js,
  `locate --run`, `RESOLVE:`, `inFlight` and a `| \`review\`` row; skills/implementation
  must keep `PART(<n>): <sha> size=<size> outcome=<pass|blocked>` and
  "appended to the run record as produced" (Preamble 3, unchanged).
- skills/run/SKILL.md cites ADRs in places today; add none in the new sentences. No ADR
  numbers in test code.

**Conventions.** As Part 1: ASCII-only test titles (no em dash, no arrow; three ASCII
dots are fine), Given/When/Then, AAA, `sut`. Markdown under skills/ is
prose-linted (advisory): no ban-list words.

### TDD steps

1. **RED — Preamble names and keys the idiom.** In test/no-op-token.test.js add
   `Given the implementation Preamble, when read, then it names the NO-OP(implementation) idiom and keys on NO-OP(planning)`:
   read skills/implementation/SKILL.md,
   `const result = sliceProse(content, /^## Preamble/, /^## Procedure/);` assert it includes
   `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)` AND
   `grep -F 'NO-OP(planning):'`. Fails: Preamble 2 only requires a plan that passes
   plan-lint; no NO-OP text exists in the Preamble.
2. **RED — the no-op branch still gates.** Add
   `Given the implementation Preamble, when the no-op branch is read, then it still runs the phase gate`:
   same slice; assert it includes `GATE(implementation): <green|red>` AND
   `` `gates.phase` once ``. Fails: the Preamble records no GATE line (it only probes for
   `gates.phase`).
3. **GREEN — Preamble 2.** Replace line 15 with exactly:

   ~~~
   2. The plan must exist and pass `plan-lint.sh` (re-run it; cheap) — **unless** no plan
      exists at `<plan-dir>/<slug>.md` and the run record holds a `NO-OP(planning):` line
      (`grep -F 'NO-OP(planning):'` on the ledger path that `run-ledger.sh locate` or the
      reorient block yields). Then the phase is a no-op: spawn nothing, append no `PART`
      line, skip Procedure 1–2, and run `gates.phase` once in-session (the Procedure 3
      gate — the phase is never gateless, even here; a manifest `override:` cannot skip
      it). One `run-ledger.sh append <run-id> implementation` call carries
      `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)`,
      `GATE(implementation): <green|red>` and `PHASE-DONE(implementation): no-op — no plan
      parts`. A red gate is handled as Procedure 3 states: fix and commit before review.
      A plan file that exists next to a `NO-OP(planning):` line is a contradiction:
      escalate `{ implementation, reason, ≤3 options }`, never guess which wins. No plan
      and no `NO-OP(planning):` line (standalone included): refuse, as before.
   ~~~

   Steps 1-2 pass.
4. **RED — walk step 7 lists both no-ops.** Add
   `Given walk step 7, when read, then both planning and implementation no-ops are produced outcomes`:
   read skills/run/SKILL.md,
   `sliceProse(content, /^7\. \*\*Record outcome\*\*/, /^8\. \*\*On blocker\*\*/)`; assert it
   includes `NO-OP(planning): no part remains` AND `NO-OP(implementation): no plan parts`.
   Fails: step 7 names only the decisions, refactoring and verify no-ops.
5. **GREEN — walk step 7.** After "…escalates as a gap." (line 379, end of the
   `NO-OP(verify)` sentence) append, same 3-space indent:

   ~~~
      `planning` and `implementation` record `NO-OP(planning): no part remains — …` and
      `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)` under the
      same convention when an earlier phase already landed every deliverable: each is
      appended in one call with its `PHASE-DONE` line, has produced its outcome, is NOT a
      missing artifact and never re-runs or escalates as a gap.
   ~~~

   Step 4 passes.
6. **RED — necessity probes widen to base.** Add
   `Given walk step 1, when the necessity-probe region is read, then an implementation no-op evaluates the downstream signals over base...HEAD`:
   `sliceProse(content, /^1\. \*\*Necessity probe/, /^2\. \*\*Resolve the skill\*\*/)`;
   assert it includes `NO-OP(implementation):` AND `<base>...HEAD`. Fails: the table's
   review/refactoring/validation/architecture signals read only "since `implementation`".
7. **GREEN — walk step 1.** Insert after the table (after line 228 and its blank line,
   before "   When provably empty:") exactly, followed by a blank line:

   ~~~
      After an implementation no-op (the run record holds `NO-OP(implementation):`), the
      `review`, `refactoring`, `validation` and `architecture` signals are evaluated over
      `<base>...HEAD` instead of "since `implementation`", so source that an earlier phase
      committed is still probed. A run whose only commits are the design doc, its ADRs and
      their citation sweeps still auto-skips all four.
   ~~~

   Step 6 passes.
8. **RED — resume row covers the no-plan cut.** Add
   `Given the implementation resume row, when read, then it covers a missing plan with a NO-OP(planning) line`:
   `const result = sliceRegion(content, IMPLEMENTATION_ROW, REVIEW_ROW);` with module-level
   constants `IMPLEMENTATION_ROW = /^\s*\| `implementation` \|/` and
   `REVIEW_ROW = /^\s*\| `review` \|/` (backticks need no escape inside a JS regex literal;
   sliceRegion keeps raw lines, which is enough for a one-line row); assert the result
   includes `NO-OP(planning):` AND `NO-OP(implementation)`. The first match of the start
   regex is line 580 (unique); the end is searched after it, so the walk-step-1 `review`
   row (line 223) is never hit. Fails: the row resumes only from `parts[]` + `git log`
   against the plan.
9. **GREEN — resume row.** In line 580 replace "Continue at the first part with neither. |"
   with exactly:

   ~~~
   Continue at the first part with neither. No plan and the ledger holds `NO-OP(planning):`: append `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)` if absent, run `gates.phase` once, then close the phase (`GATE` and `PHASE-DONE` lines). |
   ~~~

   (one table row stays one line). Step 8 passes; test/run-record.test.js still passes.
10. **GUARD — default suites.** `node --test test/no-op-token.test.js test/run-record.test.js test/craft-root-shim.test.js`
    all pass (implementation shim count 1, run 13).
11. **GUARD — completed no-op ledger.** Create
    engine/test/fixtures/run-ledger/planning-no-op.md with exactly these lines (trailing
    newline):

    ~~~
    # craft run record (append-only)
    demo resolve RESOLVE: none
    demo resolve AWAITING(propose): validation
    demo workspace PHASE-START(workspace): 2026-10-18T10:00:00Z
    demo workspace PHASE-DONE(workspace): ok
    demo design PHASE-START(design): 2026-10-18T10:02:00Z
    demo design PHASE-DONE(design): ok
    demo decisions PHASE-START(decisions): 2026-10-18T10:05:00Z
    demo decisions PHASE-DONE(decisions): ok
    demo planning PHASE-START(planning): 2026-10-18T10:10:00Z
    demo planning NO-OP(planning): no part remains — R1 → 1a2b3c4, R2 → 5d6e7f8
    demo planning PHASE-DONE(planning): no-op — no part remains
    demo implementation PHASE-START(implementation): 2026-10-18T10:12:00Z
    demo implementation NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)
    demo implementation GATE(implementation): green
    demo implementation PHASE-DONE(implementation): no-op — no plan parts
    ~~~

    In engine/test/run-state.test.js add
    `Given planning-no-op.md, when deriveRunState runs for demo, then planning and implementation complete and review is next with no parts and no warnings`:
    `const sut = deriveRunState; const result = sut(readFixture('planning-no-op.md'), RUN_ID, DEFAULT_RESOLUTION);`
    assert `result.kind === 'state'`, `completed` deep-equals
    `['workspace', 'design', 'decisions', 'planning', 'implementation']`, `inFlight` is `[]`,
    `next` is `'review'`, `awaitingHarnesses` is `['validation']`, `parts` is `[]`,
    `warnings` is `[]`. Passes on first run: `deriveRunState` derives state from
    `PHASE-START`/`PHASE-DONE` alone, and the `NO-OP` release set only filters
    `awaitingHarnesses`, which never holds planning or implementation (probed, table above).
12. **GUARD — cut after implementation starts.** Add
    `Given planning-no-op.md cut after PHASE-START(implementation), when deriveRunState runs for demo, then implementation is in flight and review is next`:
    module-level `const IMPLEMENTATION_START_RECORD = 'PHASE-START(implementation)';`; in
    the Arrange block take the fixture lines, `findIndex` the first line including that
    constant, and slice through it (inclusive). Assert `completed` deep-equals
    `['workspace', 'design', 'decisions', 'planning']`, `inFlight` deep-equals
    `[{ phase: 'implementation', since: '2026-10-18T10:12:00Z' }]`, `next` is `'review'`,
    `warnings` is `[]`. Passes on first run for the same reason.
13. **REFACTOR.** If steps 1-2 and 4/6 repeat the read of the same skill file, hoist one
    module-level `const` per file read in test/no-op-token.test.js (the existing tests read
    inline; keep their bodies unchanged). No production code to refactor.

### Gate

```
node --test test/no-op-token.test.js test/run-record.test.js test/craft-root-shim.test.js
npm --prefix engine test
bash scripts/ci.sh
```

### Commit

`feat(implementation): add the NO-OP(implementation) counterpart and its run-walk wiring`
