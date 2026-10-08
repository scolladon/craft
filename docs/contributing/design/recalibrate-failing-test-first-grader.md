# Design — recalibrate the `failing-test-first` grader

> Brief: reword the `planning-plan-lints` `failing-test-first` llm grader so the sonnet judge stops
> failing plans that add a failing test before `greet.sh` changes, and document how a grader
> rewording is validated.
> Status: draft → self-reviewed ×3

## Context

`evals/planning-plan-lints/graders/failing-test-first.md` (type `llm`, focus
`docs/plan/shout-flag.md`, arm `both`) has this body today (w0):

> Before any step that changes greet.sh, the plan has a step that adds a test expected to fail
> against the current greet.sh. Tests added after that change do not fail this.

In the 2026-10-08 model-class sweep the sonnet judge failed 10 plans that do add a failing test
before `greet.sh` changes; the maintainer rescored all 10 as PASS
(`docs/guides/model-class-matrix.md`, "Rescore" note; `BACKLOG.md`, "Recalibrate the
`failing-test-first` grader"). Each misgraded plan opens with a step that pins already-passing
behaviour (test harness plus `greet.sh Ada → Hello, Ada!`), then adds the failing `--shout`
test, and often ends with a "RED" `--shout` case without a name that may already pass. No test,
script or engine code reads the grader text; only `BACKLOG.md` and the matrix mention it.

**Corpus.** 32 recorded plans (every `failing-test-first` `evidence` field in
`~/craft-eval-results/2026-10-0{7,8}*/aggregate-result.json`), all genuine PASS on a hand read,
plus 4 synthetic negatives derived from real plans: (a) only already-passing tests before the
`greet.sh` change, `--shout` tests after; (b) `greet.sh` changed first, tests after; (c) the only
"RED" test is the already-passing `greet.sh Ada` case labelled as expected to fail; (d) a bare-arm
plan rewritten to change-then-test.

**Replay method 1 — `claude -p` (the BACKLOG entry's method): not faithful.** It reproduced 0 of
the 10 real false FAILs (1 FAIL vote in 30 against the real judge's 26 in 30). Effort low or
medium and a neutral cwd changed nothing. The cause, pinned against CLI 2.1.293
`claude plugin eval`: the real judge is a side-query with system prompt "You are a strict, terse
evaluation judge for coding-agent traces.", thinking disabled, no tools and no Claude Code
context. Its user prompt is

```
You are grading the output of a coding agent against a criterion.

Criterion:
<criteria>


Agent output (file <path>):
<text>


Respond with exactly one word: PASS or FAIL.
```

with 3 votes and a majority verdict. `claude -p` wraps the call in session context, and
stripping it (`--bare`, `CLAUDE_CODE_SIMPLE`) needs an API key with credits.

**Replay method 2 — throwaway eval suite: faithful.** A scratch plugin-eval suite with one case
per plan. The case's scaffold (≤4 lines) copies that plan to the grader's focus path. The prompt
is "Reply with the single word OK. Do not use any tools.", the agent is haiku, and the run uses
`--ablation none --runs 1 --scaffold --judge-model claude-sonnet-5-5`. One `llm` grader file per
candidate wording means every wording grades the same planted bytes. Format trap: `case.yaml`
holds only `schema_version` and `context.scaffold_script`; the frontmatter and prompt go in
`prompt.md`. Cost: USD 5.26.

**Wordings**, each changing one clause of w0:

- w2 (clause 1): "Before any step that changes greet.sh, some step adds at least one test
  expected to fail against the current greet.sh; that step may also add tests that already
  pass. Tests added after that change do not fail this."
- w3 (sentence 2): "Before any step that changes greet.sh, the plan has a step that adds a test
  expected to fail against the current greet.sh. Steps that add only already-passing tests,
  before or after that change, neither satisfy nor fail this."

**Pinned results** (real sonnet judge, method 2):

| Wording | Genuine-PASS plans failed (majority) | FAIL votes on genuine PASS | Negatives failed |
|---|---|---|---|
| w0 | 14 / 32 | 43 / 96 | 4 / 4 |
| w2 | 10 / 32 | 33 / 96 | 4 / 4 |
| w3 | 2 / 32 | 5 / 96 | 4 / 4 |

w0 reproduces 6 of the sweep's 10 false FAILs and also fails 8 plans the sweep passed. The sweep
graded those 8 with an opus judge (the sonnet column uses one), so it under-reported the sonnet
judge's failure mode.

**w3 residuals.**

- `2026-10-07T21-15` with-craft run 1: FFF under every wording. Its single RED step claims "all
  three tests fail" although `greet.sh Ada → Hello, Ada!` already passes. It does add two
  genuinely failing `--shout` tests, so the criterion holds; the false claim is a planner defect.
- `2026-10-08T06-13` bare run 1: FPF under w3, a genuine PASS. Noise.

## Requirements

- **R1.** The body of `evals/planning-plan-lints/graders/failing-test-first.md` is w3, verbatim;
  the frontmatter is unchanged.
- **R2.** `docs/contributing/maintainer-smokes.md` § Behavioural eval suite, beside the "Keep one
  clause per `llm` grader" bullet, carries one bullet (≤6 lines) that names method 2 as the way
  to validate a grader rewording and says why a `claude -p` replay misleads.
- **R3.** The "Rescore" note in `docs/guides/model-class-matrix.md` records that the grader was
  recalibrated, to what, on what evidence, and the residuals. The measured 2026-10-08 values
  stay as they are.
- **R4.** The documentation phase closes the BACKLOG entry "Recalibrate the `failing-test-first`
  grader" in the house form (`**<title> — delivered <date>**`), and records the 21-15
  with-craft run 1 plan as before/after evidence where the D-d decision puts it.

## Design

**Grader (R1).** The file after the change:

```
---
type: llm
focus: {source: file, path: docs/plan/shout-flag.md}
arm: both
---
Before any step that changes greet.sh, the plan has a step that adds a test expected to fail against the current greet.sh. Steps that add only already-passing tests, before or after that change, neither satisfy nor fail this.
```

w3 keeps the one-clause rule. Sentence 2 cannot fail a plan on its own; it only removes
already-passing steps from what the judge weighs. The single gradeable clause is still sentence
1, unchanged since w0.

**Maintainer-smokes bullet (R2)**, inserted after the "Keep one clause per `llm` grader" bullet:

```markdown
- Check a reworded `llm` grader against the real judge, not `claude -p`: the judge runs with no
  tools, thinking or session context, and a `claude -p` replay reproduced 0 of 10 real false FAILs.
  Use a throwaway suite with one case per kept plan, whose scaffold copies the plan to the focus
  path, prompt "Reply with the single word OK. Do not use any tools.", and one grader per wording.
  Run `--ablation none --runs 1 --scaffold --judge-model <sweep judge>`. `case.yaml` holds only
  `schema_version` and `context.scaffold_script`; frontmatter and prompt go in `prompt.md`.
```

Six lines at the file's width. The cost of a replay is left out: it scales with the corpus.

**Matrix note (R3).** Appended to the "Rescore" sentence group, after "(1 with craft, 3 bare).":

```markdown
The grader was then recalibrated: its second sentence now reads "Steps that add only
already-passing tests, before or after that change, neither satisfy nor fail this." Replayed
through the sonnet judge on the 32 recorded plans, the old wording failed 14 and the new one
fails 2; both fail all 4 hand-built plans that break the criterion. Of the 2, one plan's RED
step claims an already-passing test fails (a planner defect, kept as a known judge
disagreement); the other is a 2-1 FAIL split on a genuine PASS (noise). The values above are
the 2026-10-08 measurement, unchanged.
```

**BACKLOG (R4).** Closed by the documentation phase. The entry becomes
`**Recalibrate the \`failing-test-first\` grader — delivered <date>**` with a one-line summary
(w3 adopted, 14 → 2 of 32 under the faithful replay). Per D-d, the "planner labels an
already-passing test as RED" entry gains one sentence naming `2026-10-07T21-15` with-craft run 1
as before/after evidence.

## Decision candidates

D-a, D-b and D-c were decided by the user during the evidence phase and are listed for the
decisions phase to record as ADRs. D-d is open.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D-a (decided) | How to validate a grader rewording before the next paid sweep | (a) faithful replay through a throwaway plugin-eval suite and the real judge; (b) `claude -p` offline replay as the BACKLOG entry proposed; (c) no replay, check at the next sweep | **(a), decided by the user** | (b) was measured not faithful: 0 of 10 real false FAILs reproduced. (c) spends a full sweep to test one sentence. |
| D-b (decided) | Where the replay method lives | (a) throwaway harness plus a short bullet in `maintainer-smokes.md`; (b) a committed replay script under `scripts/`; (c) nothing recorded | **(a), decided by the user** | One grader recalibration does not justify a maintained script; the bullet keeps the method and its format trap findable. (c) loses the `claude -p` finding. |
| D-c (decided) | Wording and residual handling | (a) adopt w3; record 21-15 with-craft run 1 as a known judge disagreement and 06-13 bare run 1 as noise; no further paid replay; (b) adopt w2; (c) keep w0 and hand-read the planner Δ | **(a), decided by the user** | w3 cuts genuine-PASS failures from 14 to 2 of 32 and keeps 4 of 4 negatives failing. w2 only reaches 10 of 32. The 21-15 residual comes from a false RED claim in the plan, which the planner audit targets. |
| D-d (open) | Where the 21-15 with-craft run 1 evidence pointer is recorded | (a) the matrix note plus one sentence on the BACKLOG entry "The planner labels an already-passing test as RED"; (b) the matrix note only; (c) the closed recalibration entry only | **(a)** | The planner audit is the consumer of that plan; a pointer on its own entry is where the audit's author will look. (b) and (c) put it where the audit does not start. |

## Test strategy

No automated test pins grader prose, and none is added: the grader text is criterion data, and
a string-equality test would only restate the file. Verification:

- **Behaviour:** the faithful replay already run (table above). It is not re-run.
- **Gate:** `bash scripts/ci.sh` green, including design-lint over this doc and prose-lint over
  the touched `maintainer-smokes.md` and `model-class-matrix.md`.
- **Field check:** the next paid model-class sweep. A `failing-test-first` FAIL there gets a hand
  read before the planner Δ is used.

## Out of scope

- The planner prompt audit for "already-passing test labelled RED": a separate BACKLOG entry and
  a different unit (`agents/planner.md`).
- A committed replay script: excluded by D-b.
- Re-sweeping any tier or re-running the replay: the evidence is paid and complete (D-c).
- Rewriting the 2026-10-08 matrix values: they are a historical measurement.
