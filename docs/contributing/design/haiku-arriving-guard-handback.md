# Design — name the arriving-`GUARD` case in the part-implementer handback

> Brief: make haiku report the plan mismatch when a plan `GUARD` fails on its first run
> (BACKLOG "Haiku omits the arriving-`GUARD` deferred observation").
> Status: draft → self-reviewed ×3

## Context

**The rule is in the contract.** `contracts/construction.md` line 1 (ADR-421, ADR-422) ends:
"A GUARD that fails on its first run is a RED: write its GREEN, report a RED/GREEN cycle, and
note the plan mismatch as a deferred observation, not a blocker." ADR-424 pins its clauses in CI.

**The handback line was left alone.** ADR-423 kept `agents/part-implementer.md` line 16 as it
was, for lack of evidence that it needed to change:

```
- Final message: the commit hash + one line per RED/GREEN cycle and per `GUARD`, plus any deferred observations.
```

**The measured gap (the before).** `implementer-runs-guards`, Claude Code 2.1.295, with-craft /
bare / Δ over 3 runs, after the contract change: opus 1.00 / 0.29 / +0.71, sonnet 1.00 / 0.29 /
+0.71, haiku 0.86 / 0.29 / +0.57. In all three haiku sweep runs the GREEN was written and
`arrival-guard-observed` FAILed (1 of 4 counting the pilot, per BACKLOG). One run labelled the step
RED/GREEN; two kept the `GUARD` label. Opus and sonnet reported the RED/GREEN cycle and the
deferred mismatch in every run. Sources: `docs/contributing/maintainer-smokes.md` § "Implementer
case"; `docs/guides/model-class-matrix.md` note "Implementer case, 2026-10-09". The traces of
those runs were not kept, so the exact haiku handbacks cannot be quoted.

Haiku read the rule and acted on it (GREEN written), so the gap is in the handback. The current
line asks for a line "per `GUARD`" with no condition, which fits the two `GUARD`-labelled runs, and
its "any deferred observations" leaves the observation optional.

**Pinned facts** (this worktree, 2026-10-10, unless dated otherwise).

| # | Fact | Source |
|---|---|---|
| P1 | `agents/part-implementer.md` has one `Contract:` bullet, line 16 (above), 112 characters. Frontmatter pins `model: sonnet`. | file read |
| P2 | No test reads the text of `agents/part-implementer.md`. `git grep` for "Final message", "per RED/GREEN", "deferred observation" in `engine/test`, `test`, `scripts` finds nothing. `engine/test/contract-equivalence.test.js` reads assembled contracts only; agent bodies are not part of them. | grep |
| P3 | `bash scripts/sync-adapter-agents.sh --check` prints "54 mirrors in sync across 6 adapters." and exits 0. The six mirrors are `adapters/{aider,antigravity,codex,copilot,cursor,opencode}/agents/craft-part-implementer.md`. `--write` rewrites the body only and keeps each mirror's frontmatter byte-for-byte. `scripts/static-lints.sh` (called by `ci.sh`) runs `--check`, so a mirror left stale fails CI. | run; script header |
| P4 | Judge replay of 2026-10-09 (`~/craft-eval-results/2026-10-09-implementer-guard-replay/`, live grader wording, real judge via `claude plugin eval`): handback `p1` passed `arrival-guard-observed` 3 of 3 votes under both the sonnet and the opus judge. Its only mismatch wording is `GUARD "greets the world for an empty name": failed on arrival → RED/GREEN …` plus `Deferred: plan mismatch on step 1's GUARD.` Handback `n3`, which reports the test as passing and names no mismatch, FAILed 3 of 3. So a short plan-mismatch line gets the credit; the haiku FAILs fit the line being missing, not a judge too strict on wording. | `p1.txt`, `replay-sonnet.log`, `replay-opus.log` |
| P5 | Precedent for a fixed vocabulary in an agent body: once `agents/reviewer.md` named the severity set `{CRITICAL, HIGH, MEDIUM, LOW}`, `findings-shape` went from 1 of 3 to 3 of 3 at haiku (and at sonnet). | maintainer-smokes § "Reviewer output shape" |
| P6 | Craft's fixed-token family is `NAME(<param>): <payload>` (`PART(<n>):`, `SLOP-FOUND(<file>):`, `PRUNE-CANDIDATE(<unit>):`, `TUNE(<name>):`). `test/run-record.test.js:112` checks that ledger tokens are listed in the run-record spec's Token vocabulary. The handback is not a ledger line: `skills/implementation/SKILL.md` step 2 has the orchestrator check the commit and write `PART(<n>)` itself, and nothing reads the handback text by machine. `git grep PLAN-MISMATCH` finds nothing. | grep; file read |
| P7 | `claude plugin eval <path>` loads the plugin under test from `<path>` (replay log: `Plugin under test: … at <path>`), and the child's `init` lists every `craft:*` agent (maintainer-smokes § "Observed in the pilots"). A sweep launched from this worktree therefore measures this worktree's agent body. | replay log; maintainer-smokes |
| P8 | Seven of the case's graders are `arm: both`; `fired` and `contract-delivered` are `arm: with-only`. The before scores fit a 7-grader denominator: 6/7 = 0.86 and 2/7 = 0.29. | grader files |

## Requirements

- **R1.** The `Final message` bullet in `agents/part-implementer.md` says how a `GUARD` that failed
  on its first run is reported, using the shape D-1 picks, with the `GUARD`-slot scoping D-2
  picks.
- **R2.** The new text adds no rule to the contract's. It names the shape of the handback lines,
  and the words it uses ("first run", "RED/GREEN", "deferred observation", "plan mismatch") are
  the contract's own. `contracts/construction.md` stays byte-identical, so the ADR-424 pins and
  the `contract-delivered` grader are untouched.
- **R3.** No other line of the agent body changes, and the frontmatter is untouched.
- **R4.** The six adapter mirrors are regenerated with `sync-adapter-agents.sh --write`, and
  `--check` is green (P3).
- **R5.** Pinning follows D-3.
- **R6.** `bash scripts/ci.sh` is green.
- **R7.** Bookkeeping in later phases, named here so none of it is missed:
  - a new ADR for D-1/D-2 supersedes ADR-423. Per ADR-353/354 its frontmatter carries
    `supersedes: [{ adr: "423", scope: … }]` and its body carries both anchors,
    `Superseded from ADR-423` and `Carried forward from ADR-423`;
  - each new ADR bumps the README ADR count ("433 ADRs", `README.md:181`);
  - the documentation phase records before → after in the model-class-matrix note and in the
    maintainer-smokes "Implementer case" paragraph, and closes the BACKLOG entry per the repo's
    convention.

## Design

**Placement is settled by house style.** Every craft agent states its handback shape in its own
`Final message` bullet (9 of 9 agents). The arriving-`GUARD` rule itself lives on the contract TDD
line (ADR-422). The edit therefore goes in the agent body and leaves the contract alone. Putting
the token in the contract instead would move ADR-424's pinned line and add tokens to every
construction spawn (inline mode included) to fix one agent's handback.

**The line after (recommended D-1 (b), D-2 (b)).**

```
- Final message: the commit hash + one line per RED/GREEN cycle and per `GUARD` that passed on its first run, plus any deferred observations. A `GUARD` that failed on its first run gets a RED/GREEN line and the deferred observation `PLAN-MISMATCH(<test title>): the plan expected it to pass; it failed on its first run`.
```

| Clause | Closes |
|---|---|
| "per `GUARD` that passed on its first run" | the open "per `GUARD`" slot that the two `GUARD`-labelled haiku runs used for a `GUARD` that failed; this scoping matches the contract's own split (passes / fails on its first run) |
| "gets a RED/GREEN line" | the contract's "report a RED/GREEN cycle", stated where the handback is assembled |
| `PLAN-MISMATCH(<test title>): …` | the missing observation (haiku 0 of 3). The line has a fixed shape with one parameter, so it is a slot to fill rather than a reminder to remember (P5) |
| payload "the plan expected it to pass; it failed on its first run" | both clauses of `arrival-guard-observed`, in the contract's words ("first run" is before any change) and not in the grader's; P4 shows the judge credits shorter wording |

**Edge behaviour.**

| Situation | Handback after the edit |
|---|---|
| No `GUARD` fails on its first run | unchanged: RED/GREEN lines, `GUARD` lines, any deferred observations, no `PLAN-MISMATCH` |
| One `GUARD` fails on its first run | a RED/GREEN line for it plus one `PLAN-MISMATCH(<title>)` line; the passing `GUARD`s still get `GUARD` lines |
| Several `GUARD`s fail on their first runs | one RED/GREEN line and one `PLAN-MISMATCH` line per test |
| A planned RED passes on its first run | still a blocker under contract sentence 1; the token is scoped to a `GUARD`, so it does not apply |
| A `GUARD` fails and its GREEN lies outside the part | left open (BACKLOG "Bound the arriving-`GUARD` exemption to the part"); this edit neither decides nor changes it |
| A test title holding `(`, `)` or `:` | the `PLAN-MISMATCH(` prefix stays greppable; no parser reads the parameter (P6) |
| The bare arm of the eval | no agent body is loaded, so nothing changes; it stays at 0.29 |

**Delivery shape (pre-chewed for the planner).** One part, revertible on its own.

- `### Context`:
  - `agents/part-implementer.md` line 16: the only `Contract:` bullet (text in § Context). Change
    only this line.
  - `scripts/sync-adapter-agents.sh --write` regenerates the six mirrors (P3). Run it after
    the edit and commit the mirrors in the same commit. Do not hand-edit them.
  - Pin (under D-3 (b)) goes in `test/p10-structure.test.js`, next to the reviewer agent tests
    (`REVIEWER_AGENT` const at line 296, then two tests that read the body with
    `fs.readFileSync`). Add a `PART_IMPLEMENTER_AGENT = path.join(ROOT,
    'agents/part-implementer.md')` const and one test, e.g. "Given the part-implementer agent,
    when its final-message line is read, then it names the PLAN-MISMATCH token for a GUARD
    that failed on its first run". It asserts `sut.includes('PLAN-MISMATCH(<test title>):')`
    (AAA, `sut`, `result`). `fs`, `path` and `ROOT` are already imported. Do not use `grepQ`:
    it matches whole lines (`grep -qx`).
  - Not touched: `contracts/construction.md`, `engine/test/contract-equivalence.test.js`,
    `evals/implementer-runs-guards/**`, `agents/planner.md`, `templates/plan.md`.
- TDD steps under D-3 (b):
  - RED: add the pin test. It fails because the body lacks the token.
  - GREEN: replace line 16 with the recommended text, then run `sync-adapter-agents.sh
    --write`.
  - Under D-3 (a) the part has no test step.
- Gate: `bash scripts/ci.sh`. It runs the root `test/` suite and `static-lints.sh`, which
  includes `sync-adapter-agents.sh --check`.

## Decision candidates

ADR-421/422 settled the rule and where it lives; ADR-424 settled the contract pins; ADR-423
settled "handback unchanged" without evidence, and this brief brings that evidence. None of them
settled the handback form, the `GUARD`-slot scope or the agent-body pin.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D-1 | Form of the arriving-`GUARD` handback | (a) prose only: "A `GUARD` that failed on its first run gets a RED/GREEN line and a deferred observation saying the plan expected it to pass and it failed."; (b) fixed token, fixed payload: `` `PLAN-MISMATCH(<test title>): the plan expected it to pass; it failed on its first run` ``; (c) fixed token, free payload: `` `PLAN-MISMATCH(<test title>): <what the plan expected vs what ran>` `` | **(b)** | A prose instruction to note the mismatch already reaches haiku, in the contract ("note the plan mismatch as a deferred observation"), and haiku skipped it 3 of 3. (a) repeats that prose in a place closer to the handback, and nothing has measured whether that is enough. A fixed shape with one blank is what moved haiku in the reviewer case (P5), and it matches the repo's `NAME(<param>):` family and the stated preference for greppable tokens (P6). (c) lets haiku write the fix ("changed to `${1:-world}`") as the payload, which drops the expectation the grader and the contract ask for. (b) adds 208 characters (about 50 tokens) per spawn, and P4 shows the judge credits a line this short. |
| D-2 | Scope of the "per `GUARD`" slot | (a) leave "per `GUARD`" unscoped and only append the D-1 sentence; (b) scope it to "per `GUARD` that passed on its first run" | **(b)** | Two of three haiku runs used the unscoped slot to report a failed `GUARD` as a `GUARD`, against the contract's "report a RED/GREEN cycle". Under (a), the line still asks for a `GUARD` line for every `GUARD`, so the new sentence contradicts the clause right before it. (b) uses the contract's own pass/fail split and costs 6 words. No grader measures the label, so the effect is checked by the hand read (Test strategy). |
| D-3 | Structural pin on the agent body | (a) none, as ADR-412 and ADR-423 shipped; (b) pin the token prefix `PLAN-MISMATCH(<test title>):` in `test/p10-structure.test.js`; (c) pin the whole fixed line, payload included | **(b)** | The token is the greppable convention and the part of the change under measurement, so a silent rename would void the paid evidence. A prefix pin catches that in CI and gives the part a RED. (c) also freezes the payload, but no exact-match grader reads it (the judge is lenient, P4), so rewording it is an ordinary edit for the paid eval to measure. (a) leaves the token protected only by the paid sweep. Mirrors need no pin of their own: `sync --check` covers them (P3). If D-1 picks (a), there is no token: (b) and (c) then mean pinning the prose phrase instead, and (a) becomes the natural pick. |

## Test strategy

No unit test can pin model behaviour; the paid eval is the success criterion. CI proves the edit
is well formed, mirrored and pinned.

**Local, free (implementation phase).**

- `bash scripts/ci.sh` is green: the root `test/` suite with the D-3 pin, `static-lints.sh`
  (`sync-adapter-agents.sh --check`, design-lint), the engine suite with
  `contract-equivalence.test.js` unchanged, and readme-drift.
- `git diff --no-ext-diff --stat` on the part commit shows `agents/part-implementer.md`, the six
  mirrors and `test/p10-structure.test.js`, and nothing else.

**Optional judge replay (orchestrator; paid, about USD 0.02 per judge).** Run before the sweep
if the token line should be shown to earn `arrival-guard-observed` on its own. Use the
2026-10-09 replay harness (P4; maintainer-smokes "Check a reworded `llm` grader against the real
judge") with one more handback: `p1` with its mismatch wording replaced by the D-1 (b) line.
Accept if it passes by majority under the sweep judge. P4 already shows a shorter line passing,
so this step is optional.

**Paid sweep (orchestrator, after implementation, user-approved).** Follow the maintainer-smokes
§ Model-class matrix "Eval sweep" procedure, restricted with `--case`, launched from this
worktree (P7):

```bash
CLAUDE_CODE_SUBAGENT_MODEL=claude-haiku-4-5 CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \
  claude plugin eval . --case implementer-runs-guards --model claude-sonnet-5-5 \
  --no-publish --scaffold --keep-temp --allow-tools Write Bash \
  --judge-model claude-sonnet-5-5 --max-cost-usd <ceiling>
```

- First a `--runs 1` pilot under USD 5, then 3 runs under pilot `costUsd` × 3 × 1.5 (the before
  sweep cost USD 0.78 at haiku).
- Check in each trace that the agent events show `claude-haiku-4-5`.
- Hand-read every `last_message`. Record whether it has a `PLAN-MISMATCH(` line, and whether the
  step-1 test is labelled RED/GREEN or `GUARD` (the D-2 effect, which no grader measures).
  Classify every FAIL against the edge table in
  `docs/contributing/design/implementer-guard-eval.md` § Error semantics.
- Keep the result JSONs and traces outside the worktree (as `~/craft-eval-results/` holds the
  replay). The before traces were lost and cannot be quoted.

**Success criterion (haiku, with-craft arm).**

- `arrival-guard-observed` passes in at least 2 of 3 runs (before: 0 of 3 in the sweep, 1 of 4 with
  the pilot). If P8's arithmetic holds, the mean score is ≥ 0.95 (before 0.86).
- `arrival-guard-green`, `arrival-guard-ran-red`, `guard-ran-green`, `guard-never-failed`,
  `guard-reported-passing`, `no-git-revert`, `fired` and `contract-delivered` pass in every run.
- The step-1 test is labelled RED/GREEN in at least 2 of 3 runs (before: 1 of 3). This is
  recorded but not gating, since no grader reads it.
- The bare arm stays near 0.29. It receives no agent body, so a large move there is noise or a
  prompt change, not this edit.

**Opus and sonnet: optional, if budgeted.** Run the same command with `claude-opus-5-5` (judge
`claude-sonnet-5-5`) and `claude-sonnet-5-5` (judge `claude-opus-5-5`). The target is to stay at
1.00 / Δ +0.71. They already report the mismatch, so the edit changes only the shape of a line
they already write. If these tiers are not re-run, the PR says so and makes no regression claim.

A missed criterion is reported with its hand-read FAILs. It does not block the merge on its own,
because the evals are evidence, not a gate (ADR-393).

## Out of scope

- Running any paid eval or replay from an agent: the orchestrator runs them.
- `contracts/construction.md` and its CI pins (ADR-421, ADR-422, ADR-424).
- The planner side: `agents/planner.md`, `templates/plan.md` and their mirrors.
- The case itself (`evals/implementer-runs-guards/**`): it measures the agent as shipped.
- Folding `PLAN-MISMATCH` lines into the run ledger or the PR body, and listing the token in the
  run-record Token vocabulary: the handback is not a ledger line (P6), and no consumer exists.
- A `GUARD` whose GREEN lies outside its part (its own BACKLOG entry).
- Other agents' `Final message` bullets.
