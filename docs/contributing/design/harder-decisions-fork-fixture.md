# Design — harder fixture for `decisions-escalates-fork`

> Brief: drop the sentence that names the fork as uncovered from the `decisions-escalates-fork`
> fixture design doc, keep the trade-off, and re-pilot the case so its Δ measures whether the
> decisions skill spots an uncovered fork on its own (BACKLOG "Harder fixture for
> `decisions-escalates-fork`").
> Status: draft → self-reviewed ×3

## Context

**The case.** `evals/decisions-escalates-fork/` is the anti-vanity half of the decisions pair
(`docs/contributing/design/plugin-eval-suite.md` line 145 and its decision 11): its fixture is "a design with one
candidate carrying a real trade-off and no aligning ADR". Its prompt, scaffold and graders stay
as they are:

| Grader | Type, arm | Passes when |
|---|---|---|
| `fired.md` | `tool_used` Skill `craft:decisions`, with-only | the skill fired |
| `no-false-noop.md` | `regex` trace `not_contains`, with-only | no `NO-OP(decisions):` line other than the skill's own template line |
| `no-adr.md` | `file_exists` `docs/adr/002-*.md` false, both | no ADR was authored for the open fork |
| `presents-options.md` | `llm`, both | ≤3 options for the piped-output candidate, the recommendation, a request to decide, no self-settling |

The score is the mean of the two `both` graders; with-only graders sit outside it
(maintainer-smokes "Reading results", ADR-387).

**The leak.** `evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md` line 27, Why
cell of candidate 1, ends: "Whether piped callers matter more than predictability is a product
call no ADR covers." The fixture's only ADR, `fixture/docs/adr/001-greet-stays-bash-3-portable.md`,
covers bash 3.2 portability and nothing about piped output. The sentence therefore states the
conclusion the skill's triage (`skills/decisions/SKILL.md` Procedure step 1: escalate when "the
alternatives carry a real user-judgment trade-off" and no ADR aligns) is meant to reach.

**Before.** Suite pilot 2026-10-06, 1 run per arm: with-craft 1.00 / bare 1.00 / Δ 0.00. The bare
arm did the step by hand from the Decision candidates table. Recorded in
`docs/contributing/maintainer-smokes.md` (cost table row, line 164; "What the Δ column says",
lines 221–223) and `BACKLOG.md` lines 195–198.

**The sibling.** `evals/decisions-noop-when-clear` shares the prompt ("Run the craft decisions
phase standalone on docs/design/shout-flag.md.") and the doc skeleton; its Why cell names the ADR
the recommendation aligns with. After the edit the pair differs in exactly the variable under
test: one Why cell cites an aligning ADR, the other states a trade-off and cites none.

**Rules.** No CI test reads `evals/` (ADR-393, `test/plugin-evals-local-only.test.js`). Budgets
derive from a pilot of the edited case (ADR-392; maintainer-smokes "`--runs 1` is only for
piloting a new or edited case"). A Δ near 0 with a high bare score "is the evidence a prune
candidate needs" (maintainer-smokes "Reading results").

## Requirements

- **R1.** Line 27 of the fixture design doc ends its Why cell with "Predictable and simplest, but
  scripts that match `Hello` break when a caller adds `--shout`." Any other change under
  `evals/decisions-escalates-fork/` follows the scope D-1 settles.
- **R2.** `bash scripts/ci.sh` is green; `test/plugin-evals-local-only.test.js` stays green.
- **R3.** After implementation the orchestrator runs a 1-run pilot, then a 3-run run of the case
  (§ Test strategy), reads every FAIL by hand, and runs the trace check on each result.
- **R4.** The documentation phase records before → after:
  - maintainer-smokes cost-table row `decisions-escalates-fork` takes the edited case's pilot
    `costUsd` and Δ, with a note line naming its pilot date, as the `implementer-runs-guards` row
    has;
  - the "What the Δ column says" sentence on the case, which quotes the dropped phrase, is
    rewritten with the 3-run result and the D-3 reading;
  - the BACKLOG entry is closed with pilot and 3-run with-craft / bare / Δ, per-grader pass
    counts, and the D-3 reading.

## Design

**The edit** (pinned in a throwaway: scaffold, then the edit, `git diff --stat` 1 line changed;
afterwards the doc's only ADR reference is the Context link to ADR 001):

```diff
-| 1 | What `--shout` does … | (a) …; (b) …; (c) … | **(a)** | Predictable and simplest, but scripts that match `Hello` break when a caller adds `--shout`. Whether piped callers matter more than predictability is a product call no ADR covers. |
+| 1 | What `--shout` does … | (a) …; (b) …; (c) … | **(a)** | Predictable and simplest, but scripts that match `Hello` break when a caller adds `--shout`. |
```

**Remaining fork signals, each kept (D-1).** Each is either the trade-off itself or the house
shape a craft design doc always has; none says the fork is uncovered.

| Fixture line | Text | Why it stays |
|---|---|---|
| 9–10 (Context) | "Some callers pipe its output into scripts that match on `Hello`." | the stake behind alternative (b); without it the trade-off is unmotivated |
| 14 (Requirement 1) | "… prints `HELLO, ADA!` on a terminal." | leaves piped behaviour open, as the candidate says |
| 20–21 (Design) | "Its behaviour when stdout is not a terminal is decision candidate 1." | same pointer shape as the sibling's "chosen in decision candidate 1" |
| 23–27 | the Decision candidates table and its "but …" clause | template section; the brief keeps the trade-off stated |

**Outcome matrix** (score = mean of `no-adr`, `presents-options`):

| Arm behaviour | `no-adr` | `presents-options` | Score |
|---|---|---|---|
| asks the user, ≤3 options, recommendation shown, no ADR | PASS | PASS | 1.00 |
| adopts (a) and authors `002-*.md` | FAIL | FAIL | 0.00 |
| adopts (a) in prose, writes no ADR | PASS | FAIL | 0.50 |
| asks the user but also authors an ADR | FAIL | PASS | 0.50 |

**Edge behaviour.**

| Case | Reading |
|---|---|
| with-craft adopts (a) as aligned with a craft principle ("simplest") | `no-false-noop` (with-only) and both scored graders can FAIL. A finding on the skill's triage step 1, recorded, not fixed here |
| with-craft escalates, bare adopts | Δ > 0: the result the edit aims to expose |
| both arms escalate | Δ 0.00 again: read per D-3 |
| `presents-options` FAIL where the reply escalates on a hand read | judge disagreement, recorded as such; the wording is unchanged, so no replay is owed unless it recurs |

**Delivery shape (pre-chewed for the planner).** One standalone part, test-infra only:
edit line 27 of `evals/decisions-escalates-fork/fixture/docs/design/shout-flag.md` per R1; gate
`bash scripts/ci.sh`. Commit `test(evals): drop the uncovered-fork hint from the decisions-escalates-fork fixture`.
The R4 doc edits wait for the paid runs and belong to the documentation phase:
`docs/contributing/maintainer-smokes.md` lines 164, 170 (the note line under the table) and 221–223; `BACKLOG.md`
lines 195–198.

## Decision candidates

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D-1 | Edit scope in the fixture | (a) drop the one sentence only; (b) also drop the Design pointer "Its behaviour when stdout is not a terminal is decision candidate 1."; (c) also drop "on a terminal" from Requirement 1 | **(a)** | The sentence is the only text that names the fork as uncovered. (b) removes a pointer the sibling fixture also carries, so the pair would differ in two variables. (c) makes Requirement 1 read as "shout everywhere", which tilts toward (a) and stops the candidate from being open. |
| D-2 | What the 1-run pilot gates | (a) validity only: run the 3-run unless the pilot is invalid (craft has a `suite.plugins` problem, a tool-grant warning, a scaffold error, a timeout, a NO-TRACE / TRACE-GONE row); the Δ is read from the 3-run only; (b) run the 3-run only if the pilot shows a bare FAIL; (c) skip the pilot and cap the 3-run from the 2026-10-06 cost (0.29) | **(a)** | One run per arm cannot separate the arms, and a 0.00 pilot is the result that most needs the 3-run (the brief: "not prune evidence until the 3-run sweep"). (b) lets one noisy run decide. (c) breaks "pilot an edited case" and ADR-392's pilot-derived ceiling. |
| D-3 | Reading of a 3-run Δ near 0.00 with bare near 1.00 | (a) record it as prune evidence for the skill's escalation path (maintainer-smokes "Reading results"), enact nothing here, keep the case for its with-only `no-false-noop`; (b) record the numbers with no prune reading and leave the case as is; (c) harden the fixture again and re-pilot | **(a)** | After the edit no text hands the bare arm the answer, so a bare 1.00 is the bare model escalating on its own, which is what the prune rule asks for. The case still guards an unconditional `NO-OP(decisions):`, so it stays. (c) has nothing left to remove but the trade-off, which would make the candidate no fork. |
| D-4 | Before baseline for the comparison | (a) the 2026-10-06 1-run numbers as "before"; (b) also a 3-run on the unedited fixture | **(a)** | The question is whether the edited fixture separates the arms, which the after 3-run answers on its own. (b) would compare before and after at equal n, and so test the hint attribution in maintainer-smokes line 221, but it adds a second paid 3-run on a fixture being retired. |

## Test strategy

No automated test reads `evals/` (ADR-393). Evidence is local checks, then paid runs that the
orchestrator executes after implementation; no agent runs them.

**Local, free.**

- `bash scripts/ci.sh` green (covers `test/plugin-evals-local-only.test.js` and design-lint).
- Scaffold dry-run in a throwaway: `T=$(mktemp -d) && cd "$T" && git init -q && bash
  <case>/scaffold.sh`; the fixture commit exists, `grep -c 'product call' docs/design/shout-flag.md`
  prints 0, `grep -c 'break when a caller adds' docs/design/shout-flag.md` prints 1.

**Paid pilot (1 run per arm).**

```bash
claude plugin eval . --tag phase --case decisions-escalates-fork --runs 1 --no-publish --scaffold \
  --keep-temp --allow-tools Write Bash --judge-model claude-sonnet-5-5 --max-cost-usd 5
```

Check the validity items of D-2, run the maintainer-smokes "Trace check, every run" on the
`aggregate-result.json`, and read every grade's `evidence` and each kept trace.

**3-run.** The same command without `--runs 1` (default 3) and with
`--max-cost-usd` = pilot `costUsd` × 3 × 1.5. Record with-craft / bare / Δ, each grader's pass
count out of 3 per arm, a hand-read classification of every FAIL against the outcome matrix,
and the trace check per run.

## Out of scope

- Grader, prompt, scaffold or ADR fixture changes: the leak is one sentence in the design doc.
- `docs/contributing/plan/plugin-eval-suite.md` lines 646 and 800, which quote the old fixture: a
  dated plan records what was built then.
- Enacting a prune of the decisions skill's escalation path: D-3 records evidence only.
- `decisions-noop-when-clear` and the model-class sweep: neither is touched by this edit.
