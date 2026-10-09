# Design — arriving-`GUARD` rule in the construction contract

> Brief: state in `contracts/construction.md` what the part-implementer does when a plan `GUARD`
> fails on its first run (BACKLOG "State the arriving-`GUARD` rule in the construction
> contract").
> Status: draft → self-reviewed ×3

## Context

**The line today.** `contracts/construction.md` line 1 (ADR-412 decision text in its third
sentence):

```
RED→GREEN→REFACTOR strictly: write the test first, run it (it must fail for the stated reason), then write minimal code to pass, then refactor. Never write implementation before its failing test. A plan GUARD entry is written, run, and confirmed passing for its stated reason: it owes no failure and no GREEN, and no step breaks code to watch it fail.
```

It says nothing about a `GUARD` that fails when first run. The intended rule exists only in
`docs/contributing/design/planner-red-label-audit.md` § "Contract edge behaviour": such a
`GUARD` is a RED under the first sentence; the implementer writes its GREEN, reports a RED/GREEN
cycle, notes the plan mismatch as a deferred observation, and hands back no blocker. The same
section keeps a planned RED that passes on arrival a blocker, and leaves a `GUARD`-only part and
a no-`GUARD` plan unaffected.

**The measured gap (the before).** `evals/implementer-runs-guards` (PR #24, ADR-413: plan step 1
is a `GUARD` that fails on fixture bytes alone). Claude Code 2.1.295, 3 runs per arm, with-craft
/ bare / Δ:

| Agent tier | Score | With-craft behaviour at the step-1 `GUARD` |
|---|---|---|
| opus | 0.57 / 0.29 / +0.29 | 4 of 4 runs removed the test edit and handed back a blocker, citing "owes no GREEN" |
| sonnet | 0.57 / 0.29 / +0.29 | 5 of 5 runs did the same |
| haiku | 0.86 / 0.29 / +0.57 | 4 of 4 runs wrote the GREEN, kept the `GUARD` label, and noted no plan mismatch |

Sources: `docs/guides/model-class-matrix.md` note "Implementer case, 2026-10-09";
`docs/contributing/maintainer-smokes.md` § "Implementer case". Two failure modes, one per
reading of "owes no failure and no GREEN": as an absolute (opus, sonnet: block), and as silent
license (haiku: fix it without saying so).

**Pinned facts** (this worktree, 2026-10-09, Claude Code 2.1.295).

| # | Fact | Source |
|---|---|---|
| P1 | `node engine/bin/contract-assemble.js --descriptor-id implementation`, run from an empty `mktemp -d`, exits 0 and prints 18 lines; line 13 is `construction.md` line 1 verbatim. | run, 2026-10-09 |
| P2 | `contract-assemble` resolves `contracts/` from its own checkout (`engine/src/contract-assemble-main.js:28`, `join(REPO_ROOT, 'contracts')`), and the case scaffold calls it via `$case_dir/../../engine/bin/`. An eval launched from this worktree therefore measures this worktree's contract. | source read; `evals/implementer-runs-guards/scaffold.sh` |
| P3 | `evals/implementer-runs-guards/graders/contract-delivered.md` is `type: tool_used`, `tool: Agent`, `input_match: 'confirmed passing for its stated reason'`, `arm: with-only`. The phrase has no regex metacharacter, quote or backslash, so it matches the JSON-serialized Agent input unchanged. | grader file; `docs/contributing/design/implementer-guard-eval.md` P1 |
| P4 | `contracts-lint` checks each bundle exists, is non-empty, and does not contain "retrieval" (`engine/src/contracts-lint-main.js`). No length or line-count rule. | source read |
| P5 | `engine/test/contract-equivalence.test.js` `PHASE_EXPECTATIONS.construction` = `['RED→GREEN→REFACTOR', 'atomic commit', 'sut']`, matched case-insensitively as substrings (`hasCI`) in every descriptor that carries the bundle. The agent-vs-inline test expects exactly two differing lines; both modes include the construction bundle, so an added sentence or line does not move that count. | source read |
| P6 | No test pins the `GUARD` sentence: grep for "owes no failure" or "confirmed passing for its stated reason" hits only `contracts/`, the grader, BACKLOG, docs (design, plan, ADR-412, maintainer-smokes). `engine/test/scenarios.test.js:61` reads the file into `REAL_FRAGMENTS` and asserts no text of it. | grep, 2026-10-09 |
| P7 | `agents/part-implementer.md` line 16: "Final message: the commit hash + one line per RED/GREEN cycle and per `GUARD`, plus any deferred observations." It already has a slot for a RED/GREEN cycle and for a deferred observation. | file read |
| P8 | `claude plugin eval --help` lists `--case <glob>` ("Filter cases by name glob") independent of `--tag`. | CLI 2.1.295 |

## Requirements

- **R1.** `contracts/construction.md` states the arriving-`GUARD` rule in the place and words
  D-1 and D-2 settle: a `GUARD` that fails on its first run is a RED; the implementer writes its
  GREEN, reports a RED/GREEN cycle, notes the plan mismatch as a deferred observation; this is not
  a blocker.
- **R2.** The contract keeps the exact substrings `confirmed passing for its stated reason` (P3)
  and `RED→GREEN→REFACTOR` (P5), and the first two sentences of line 1 byte-identical. It gains
  no "retrieval" (P4) and no backticks (no contract fragment uses them).
- **R3.** A planned RED that passes on its first run stays a blocker: no added text weakens "it
  must fail for the stated reason".
- **R4.** `agents/part-implementer.md` and every adapter mirror change only as D-3 settles.
  `contracts/` has no adapter mirror and no drift baseline; no mirror is regenerated for it.
- **R5.** Structural pinning as D-4 settles.
- **R6.** `bash scripts/ci.sh` green; `contracts-lint` and `test/plugin-evals-local-only.test.js`
  green; no test reads `evals/` (ADR-393).
- **R7.** After implementation, the orchestrator re-runs `implementer-runs-guards` per agent
  tier (Test strategy); the documentation phase records before → after in the matrix note and
  the maintainer-smokes "Implementer case" paragraph, rewrites that paragraph's quote of the
  old sentence, and closes the BACKLOG entry per the repo's convention.

## Design

**Scope of the edit.** One file of behaviour (`contracts/construction.md`), plus the test edit
D-4 picks. The contract reaches every part-implementer spawn through `contract-assemble`
(bundle `construction`, P1); the case reaches it the same way (P2), so the paid sweep measures
the edit directly.

**The line after (recommended D-1 (b), D-2 (a)).**

```
RED→GREEN→REFACTOR strictly: write the test first, run it (it must fail for the stated reason), then write minimal code to pass, then refactor. Never write implementation before its failing test. A plan GUARD entry is written and run, and no step breaks code to watch it fail. A GUARD that passes on its first run is confirmed passing for its stated reason and owes no failure and no GREEN. A GUARD that fails on its first run is a RED: write its GREEN, report a RED/GREEN cycle, and note the plan mismatch as a deferred observation, not a blocker.
```

| Clause | Closes |
|---|---|
| "no step breaks code to watch it fail" | ADR-412's break-to-prove ban, still binding every `GUARD` |
| "A GUARD that passes on its first run is confirmed passing for its stated reason and owes no failure and no GREEN" | ADR-412's confirmation and exemption, now scoped to the case they were written for, so neither reads as an absolute a failing `GUARD` cannot meet (opus, sonnet); the grader phrase survives (P3) |
| "fails on its first run is a RED: write its GREEN" | the blocker and the removed test edit (opus, sonnet) |
| "report a RED/GREEN cycle" | a fixed failing `GUARD` reported under the `GUARD` label (haiku) |
| "note the plan mismatch as a deferred observation" | the silent fix (haiku); it lands in the handback slot P7 already has |
| "not a blocker" | names the outcome the core blocker protocol would otherwise default to |

"On its first run" replaces the design-doc term "on arrival": it names the observable event
(the first execution of the test, before any code written for it), and needs no definition.

**Contract edge behaviour.** Each row is the rule after the edit; only the first changes.

| Situation | Outcome | Governing text |
|---|---|---|
| `GUARD` fails on its first run | RED: GREEN written, RED/GREEN line, deferred observation, no blocker | new sentence |
| `GUARD` passes on its first run | no failure, no GREEN, no break-to-prove | "passes on its first run owes …"; "no step breaks code …" |
| Planned RED passes on its first run | blocker, as before | sentence 1, "it must fail for the stated reason" (untouched) |
| Part made only of `GUARD` entries, all passing | no implementation; refactor against green guards | as before (planner-red-label-audit § Contract edge behaviour) |
| `GUARD` fails and its GREEN lies outside the part | not decided here: the Scope line and "not a blocker" pull apart; no run has shown it | contract line 2 (untouched) |
| Plan with no `GUARD` | the `GUARD` sentences are inert | as before |

**Interaction with the case.** The fixture's step 1 fails on bytes (`${1-world}` with `""`
prints `Hello, !`). Under the new line the implementer keeps the test, edits `greet.sh` (for
example `${1:-world}`), and continues to steps 2–5. That run reaches step 4, so
`guard-ran-green` and `guard-never-failed` turn non-vacuous for opus and sonnet, which stopped at
step 1 in the before.

**Delivery shape (pre-chewed for the planner).** One part; the edit reverts on its own.

- `### Context`:
  - `contracts/construction.md`: four lines; line 1 is the target (text in § Context).
  - `engine/test/contract-equivalence.test.js`: `PHASE_EXPECTATIONS` (const, top of file),
    `construction` entry `['RED→GREEN→REFACTOR', 'atomic commit', 'sut']`; matching is
    case-insensitive substring via `hasCI`; the per-bundle test is
    `Given descriptor "<id>" with bundle "<bundle>", when assembled in agent mode, then bundle
    markers are all present`. Touched only if D-4 picks (b) or (c).
  - Not touched: `agents/part-implementer.md` (if D-3 (a)), `adapters/**`,
    `engine/test/scenarios.test.js` (reads the file, asserts none of its text, P6).
- TDD steps under D-4 (c): RED — add the new-clause marker (`fails on its first run is a RED`)
  to the `construction` array; it fails because the contract lacks it. GUARD — add
  `confirmed passing for its stated reason`; passes because line 1 already carries it. GREEN —
  rewrite `contracts/construction.md` line 1 to the recommended text. Under D-4 (a) the part has
  no test step; under (b) it drops the GUARD step.
- Gate: `bash scripts/ci.sh` (runs `contracts-lint` and the engine suite).

## Decision candidates

ADR-412 settled that the contract carries a `GUARD` clause and the handback a `GUARD` slot; the
planner-red-label-audit design settled the arriving-`GUARD` outcome itself. Neither settled the
wording, placement, handback, or pinning below.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D-1 | Clause wording | (a) append one sentence after the ADR-412 sentence, which stays byte-identical: "A GUARD that fails on its first run is a RED: write its GREEN, report a RED/GREEN cycle, and note the plan mismatch as a deferred observation, not a blocker."; (b) split the ADR-412 sentence so the exemption is scoped to a passing `GUARD`, then add the failing case (§ Design text); (c) (b) plus "A planned RED that passes on its first run stays a blocker." | **(b)** | The measured failure is opus and sonnet reading "owes no failure and no GREEN" as an absolute. (a) leaves that absolute standing and layers an exception after it, so the model must resolve a contradiction in the same line. (b) removes the contradiction at its source for 34 more characters (line 1: 351 today, 509 under (a), 543 under (b)). (c) restates what sentence 1 already enforces, adds tokens to every spawn, and has no measured failure behind it. (b) rewrites ADR-412's decision text, so its ADR refines ADR-412. |
| D-2 | Placement | (a) on line 1, after the `GUARD` sentence; (b) a new line 2 in `contracts/construction.md`; (c) a contract bullet in `agents/part-implementer.md` | **(a)** | Line 1 is the TDD line, and the rule only reads correctly next to "it must fail" and the `GUARD` sentence. (b) separates the exemption from its exception. (c) puts a contract rule in the agent body, outside ADR-412's subject, and forces regenerating six adapter mirrors. |
| D-3 | `agents/part-implementer.md` handback line | (a) unchanged; (b) append "a `GUARD` that failed on its first run reports as a RED/GREEN cycle" | **(a)** | P7: the line already has a RED/GREEN slot and a deferred-observation slot, which the new clause names. (b) duplicates the contract and adds a mirror regeneration for no gap the case measured: haiku used the `GUARD` label because the contract said nothing, not because the handback line lacked a slot. |
| D-4 | Structural pin | (a) none, as ADR-412's contract edit shipped; (b) add the new-clause marker to `PHASE_EXPECTATIONS.construction`; (c) (b) plus `confirmed passing for its stated reason` | **(c)** | The eval's `contract-delivered` grader breaks silently if that phrase is reworded, and only a paid run would show it. Two array entries in an existing mechanism turn that into a CI failure, without the test reading `evals/`. (b) protects only the new clause. (a) leaves both to the paid sweep and gives the part no RED. |

## Test strategy

No unit test can pin model behaviour; the paid eval is the success criterion. CI proves the edit
is well-formed and pinned.

**Local, free (implementation phase).**

- `bash scripts/ci.sh` green: `contracts-lint`, `contract-equivalence.test.js` (with the D-4
  markers), `scenarios.test.js`, `test/plugin-evals-local-only.test.js`, readme-drift.
- Contract assembly in a throwaway:
  `T=$(mktemp -d) && (cd "$T" && node <worktree>/engine/bin/contract-assemble.js --descriptor-id implementation)`.
  It exits 0; its output contains `confirmed passing for its stated reason` and the new
  sentence once each; the line count is 18 under D-2 (a).

**Paid sweep (orchestrator, after implementation, user-approved).** The maintainer-smokes
§ Model-class matrix "Eval sweep" procedure, restricted to this case by `--case` (P8), launched
from this worktree (P2):

```bash
CLAUDE_CODE_SUBAGENT_MODEL=<agent-id> CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \
  claude plugin eval . --case implementer-runs-guards --model claude-sonnet-5-5 \
  --no-publish --scaffold --keep-temp --allow-tools Write Bash \
  --judge-model <judge> --max-cost-usd <ceiling>
```

- `<agent-id>`: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-4-5`.
- `<judge>`: `claude-sonnet-5-5`, except `claude-opus-5-5` for the sonnet column.
- Per tier: a `--runs 1` pilot under USD 5, then 3 runs under pilot `costUsd` × 3 × 1.5.
- Hand-read every FAIL and classify it (the case's edge table in
  `docs/contributing/design/implementer-guard-eval.md` § Error semantics).

**Success criterion, per tier, with-craft arm.**

- No run hands back a blocker on the step-1 `GUARD`; `arrival-guard-ran-red` and
  `arrival-guard-green` pass in every run (before: every opus and sonnet run blocked).
- `arrival-guard-observed` passes in at least 2 of 3 runs at every tier (before: no haiku run
  noted the mismatch).
- `guard-ran-green`, `guard-never-failed`, `guard-reported-passing`, `no-git-revert` pass; at
  opus and sonnet these are measured past step 1 for the first time.
- `contract-delivered` and `fired` pass in every run.
- The bare arm stays near 0.29: it receives the same contract (shared prompt) but no agent body,
  so a large bare move is read as noise or a prompt change, not as this edit.

A tier that misses the criterion is reported with its hand-read FAILs; it does not block the
merge on its own, because the evals are evidence, not a gate (ADR-393).

## Out of scope

- Running any paid eval from an agent: the orchestrator runs the sweep.
- The planner side: `agents/planner.md`, `templates/plan.md` and their mirrors (ADR-407, ADR-409).
- Changing the rule for a planned RED that passes on its first run (stays a blocker, R3).
- Other contract bundles and the core blocker protocol.
- Adapter mirrors: `contracts/` has none; `agents/part-implementer.md` mirrors change only if
  D-3 picks (b).
- Filling the model-class matrix part-TDD cell: that stays with the full-pipeline run.
- Changing the case (`evals/implementer-runs-guards/**`): it measures the contract as shipped.
- A `GUARD` whose GREEN lies outside its part (edge table): no run has produced one.
