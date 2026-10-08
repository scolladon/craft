# Design — planner RED-label audit

> Brief: audit `agents/planner.md` so `craft:planner` never labels a test RED, or says it is
> expected to fail, when that test already passes against the code as it stands at that step.
> Status: draft → self-reviewed ×3

## Context

**The unit.** `agents/planner.md` (39 lines, unchanged since 2026-09-21) is a terse contract
list. Its only TDD rule:

```
- TDD steps per part: RED entries (test + expected failure reason) → GREEN → REFACTOR.
```

Couplings:

- Mirrors: `adapters/{aider,antigravity,codex,copilot,cursor,opencode}/agents/craft-planner.md`
  carry the body byte for byte. `scripts/sync-adapter-agents.sh --write` regenerates them, and
  `scripts/ci.sh` runs `--check`, so a hand-edited mirror or a forgotten sync fails CI.
- `templates/plan.md` line 32, the `### TDD steps` comment, repeats the rule:
  `<!-- RED entries (test, expected failure reason) → GREEN (minimal code) → REFACTOR. -->`.
  The planner reads the template on every run. Kept plans copy its sizing bullets verbatim
  (">with zero context: whatever a part block omits…", "A part that would be a pure test pass
  over already-landed code…"). `engine/src/plan-lint-main.js` checks part headings and
  `### Context` paths, never comment text, and CI does not lint the template itself.
- No structure test pins planner wording (`test/` and `engine/test` have none). No skill or
  agent other than the planner names "RED entries". `agents/part-implementer.md` reports "one
  line per RED/GREEN cycle" and says nothing about a test that passes on arrival.

**Prior decisions.** ADR-405: the `failing-test-first` grader ignores steps that add only
already-passing tests, so the judge cannot see RED-label accuracy; it must be counted by hand.
ADR-406: the 2026-10-07T21-15 with-craft run 1 plan is the before-evidence for this audit.
`docs/contributing/maintainer-smokes.md` § Behavioural eval suite, "Evidence, not gate", maps
`agents/planner.md` to `planning-plan-lints` and asks for a run before and after a prompt edit.

**The eval fixture.** `evals/planning-plan-lints/fixture/greet.sh` is
`printf 'Hello, %s!\n' "${1:-world}"`. The design asks for `--shout`. Against the original
script:

| Test | Requirement | Original script | After a GREEN that parses `--shout`, `shift`s, reads `${1:-world}` |
|---|---|---|---|
| T1 `greet.sh --shout Ada` → `HELLO, ADA!` | 1 | fails (`Hello, --shout!`) | passes |
| T2 `greet.sh Ada` → `Hello, Ada!` | 2 | passes | passes |
| T3 `greet.sh --shout` → `HELLO, WORLD!` | 3 | fails (`Hello, --shout!`) | passes |
| T0 `greet.sh` → `Hello, world!` | none (some plans add it) | passes | passes |

T2 and T0 can never be RED. T3 is RED only before the GREEN that handles `--shout`. The
fixture's design doc also says "Each test is written failing before greet.sh changes", which
T2 cannot meet. The prompt rule has to hold against that sentence.

**Before evidence, read by hand.** Every kept with-craft plan from the four result directories
under `~/craft-eval-results/`, all produced by today's `agents/planner.md` and
`templates/plan.md`. Defect classes:

- **C1 false failure claim:** a test that passes at its step is said to fail.
- **C2 RED label on a passing test:** the plan labels a test RED, or "RED/guard", or hedges it
  ("if step 2 already makes it pass…"), although the plan's own earlier steps make it pass.
- **C3 break-to-prove step:** a step changes code temporarily, or asks to confirm a failure
  against some other version of the code, to watch an already-passing test fail.

| Run (agent tier) | Plan | C1 | C2 | C3 | Clean |
|---|---|---|---|---|---|
| 2026-10-07T07-35 (haiku session) | with-1 | RED 2: T2 "currently fails" | RED 3: T3 hedged | no | no |
| 2026-10-07T21-15 (sonnet) | with-0 | no | "RED 2" heading on T2, which the text calls "not a RED" | no | no |
| | with-1 | single RED: "All three tests fail", T2 included | no | no | no |
| | with-2 | no (T2 named a passing guard inside the RED step) | no | no | **yes** |
| 2026-10-08T06-13 (sonnet agents) | with-0 | no | step 3 T3 hedged; step 4 "RED/regression guard" | step 3 "flip to confirm" | no |
| | with-1 | no | step 3 T3 hedged; step 4 "RED/guard" | no | no |
| | with-2 | no | "RED 2 (regression guard)"; RED 3 T3 after GREEN 1 | RED 2 "temporarily making the flag unconditional"; RED 3 "write it before handling the default", although GREEN 1 already reads `${1:-world}` | no |
| 2026-10-08T06-34 (opus agents) | with-0 | no | step 3 "RED … passes immediately" | "confirm it would have failed … had a bare `$1` been used" | no |
| | with-1 | no | step 3 "RED … passes immediately" | "temporarily checking it fails against a version without the default" | no |
| | with-2 | no | step 4 "RED … should already pass … guard either way" (step 1 is an unlabelled baseline, which is correct) | no | no |

10 plans (07-35 with-0 and with-2 kept no plan text). Clean: 1 of 10. C1: 2, C2: 8, C3: 4.
C2 has two sources: a passing T2 or T0 under a RED heading (4 plans), and T3 placed after the
GREEN that already satisfies it (7 plans). C3 targets T3 in 4 plans and T2 in one (06-13
with-2). The T3 shape is the BACKLOG entry's "temporarily remove the `shift`".

**The contract frames every test as RED.** A crude grep, not a hand read: the word `RED`
appears in 10 of 10 with-craft plans and in 4 of 12 bare plans from the same runs. The bare
arm does not read `agents/planner.md`. The likely cause: "RED entries → GREEN" is the only
label the contract offers, so every test step gets it.

## Requirements

- **R1.** The `agents/planner.md` TDD bullet states: a RED test fails against the code as it
  stands at its step, after every earlier GREEN; a test that passes there carries the non-RED
  label chosen in D-c and is never called RED or expected to fail; no step changes code to
  watch a passing test fail. The ordering clause is included or left out per D-b. The bullet
  stays at most 6 lines, and no other line of the file changes.
- **R2.** The six adapter mirrors equal the new body: `bash scripts/sync-adapter-agents.sh
  --check` exits 0.
- **R3.** Under D-a (b) or (c), the `templates/plan.md` `### TDD steps` comment names the same
  label and says a passing test is never RED. Under D-a (a) the template is unchanged.
- **R4.** The behavioural evidence (Test strategy) is recorded before the BACKLOG entry "The
  planner labels an already-passing test as RED" closes. The documentation phase closes it in
  the house form `**<title> — delivered <date>**` with the before and after hand counts and
  with-craft scores per tier.

## Design

**Planner bullet (R1)**, with the recommended D-b (b) and D-c (a). It replaces the bullet
quoted in Context:

```markdown
- TDD steps per part: RED entries (test + expected failure reason) → GREEN → REFACTOR.
  A RED test fails against the code as it stands at its step, earlier GREENs included;
  its reason names what that code does instead. A test that already passes there is a
  `GUARD` entry (test + why it passes), never RED. Put a new-behaviour test before the
  GREEN that satisfies it. No step breaks code to watch a test fail.
```

Each sentence and the shape it removes:

| Sentence | Removes |
|---|---|
| "fails against the code as it stands at its step, earlier GREENs included" | C1 for T2; the hedge in C2 (the planner wrote the earlier GREEN, so it knows the result) |
| "its reason names what that code does instead" | reasons with no observable output, such as 07-35's "logic incorrectly tries to parse name" |
| "`GUARD` entry … never RED" | C2: "RED/guard" hybrids and RED headings on declared guards |
| "Put a new-behaviour test before the GREEN that satisfies it" | the cause of C2 and C3 for T3, which then becomes a real RED, as in 21-15 with-0 and with-2 |
| "No step breaks code to watch a test fail" | C3 |

Under D-b (a) the fourth sentence is dropped. T3 after GREEN 1 then becomes a correctly
labelled `GUARD`, but requirement 3 never has a failing test.

**Edge behaviour.**

- *A step with several tests* (21-15 with-2, 06-34 with-1 step 1): allowed. The label
  belongs to the test, not the step: the step adds a RED test and names each passing test as
  a `GUARD` in the same step. 21-15 with-2, the one clean plan, keeps passing.
- *A part with no failing test* (refactor-only, characterisation before a refactor): every
  test is a `GUARD`. The bullet does not require a RED in every part. `failing-test-first`
  checks that for this fixture, and ADR-405 leaves it unchanged.
- *A GREEN for an already-passing test* (06-34 with-0 step 4): with the test a `GUARD`, no
  GREEN is owed. The bullet does not mention it.
- *Docs-only and test-infra-only parts*: the rule does not apply when a part adds no test.
- *The fixture's "Each test is written failing" sentence*: the rule wins. A plan that
  obeys it labels T2 a `GUARD`, which is the adversarial case the eval keeps.

**Template comment (R3)**, under D-a (b), at `templates/plan.md` line 32:

```markdown
<!-- RED entries (test, expected failure reason) → GREEN (minimal code) → REFACTOR.
     A test that already passes at its step is a GUARD entry (test, why it passes), never RED. -->
```

The comment stays a summary of the agent rule. The ordering and no-break clauses live only
in the agent, so the template does not duplicate the whole rule.

**Mirrors (R2).** Edit `agents/planner.md` only, then run
`bash scripts/sync-adapter-agents.sh --write`. The mirrors at
`adapters/<adapter>/agents/craft-planner.md` change through the script, never by hand.

**Delivery shape.** One part: `agents/planner.md`, `templates/plan.md` and the six
regenerated mirrors. The part's `### Context` backticks only `agents/planner.md` and
`templates/plan.md` and names the mirrors in plain text as outputs of the sync script: eight
backticked paths would exceed plan-lint's per-part ceiling of 6. The gate is
`bash scripts/ci.sh`. The paid before and after runs sit outside the part (Test strategy).

## Decision candidates

None of these is settled by ADR-405 or ADR-406.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D-a | Which prompt surfaces carry the rule | (a) `agents/planner.md` only; (b) `agents/planner.md` plus the `templates/plan.md` TDD comment; (c) (b) plus a line in `agents/part-implementer.md` on a planned RED that passes on arrival | **(b)** | The planner reads the template on every run and copies its prose into plans. Under (a) the template still says "RED entries" with no other label, which contradicts the agent. (c) changes a unit with no eval case behind it (`agents/part-implementer.md` is not in the "Evidence, not gate" table), so it would ship without evidence. |
| D-b | What the rule asks | (a) label only: a passing test is a `GUARD`, never RED, and no break-to-prove step; (b) (a) plus ordering: put a new-behaviour test before the GREEN that satisfies it; (c) ordering only | **(b)** | (a) makes the labels honest but leaves T3 with no failing test, because GREEN 1 does more than it has to. (b) gives T3 a real RED and matches both reference plans (21-15 with-0, with-2). (c) leaves C1 and C2 for T2, which no ordering can make fail. Cost of (b): one more sentence. |
| D-c | The label for a passing test | (a) a fixed token `GUARD`; (b) free prose such as "regression guard (not a RED)"; (c) a fixed token `CHARACTERISATION` | **(a)** | A fixed token can be grepped in a plan and is easy for the model to recall. 8 of the 10 kept plans already use the word "guard". Free prose is what produced the "RED/guard" hybrids. Characterisation means pinning legacy behaviour before a refactor, which is narrower than a requirement guard such as T2. |
| D-d | The "before" baseline | (a) a fresh `planning-plan-lints` run per tier on the unchanged tree, with the 10 kept plans added to the hand count; (b) the kept plans only, then after-runs per tier; (c) one sonnet after-run, compared with the kept plans | **(a)** | The kept plans are valid before-plans for the hand count (same `agents/planner.md` and template). Their scores are not: they were graded before the `failing-test-first` recalibration. Haiku has no kept plan from a sonnet session either. (b) saves about half the spend but compares scores across two grader versions. (c) cannot show a per-tier effect. |
| D-e | How RED-label accuracy is measured | (a) by hand, using the C1/C2/C3 count; (b) a new one-clause `llm` grader in `planning-plan-lints`, checked against the 10 hand-read plans through the faithful replay (ADR-403); (c) both | **(a)** | Each tier's after-run produces 3 with-craft plans, so a hand read is cheap. A grader needs its own paid replay and adds a column to every future sweep. That spend is worth it only if the after-count still shows mislabels. ADR-405 keeps `failing-test-first` itself blind to passing steps. |

## Test strategy

No automated test pins planner prose, and none is added. The bullet is prompt text, and a
string-equality test would only repeat the file. That matches the `failing-test-first`
grader decision.

**CI gate.** `bash scripts/ci.sh` green: `sync-adapter-agents.sh --check` (mirror drift),
design-lint over this doc, readme-drift (corpus count), and prose-lint over touched README
prose.

**Behavioural evidence, not a gate.** `planning-plan-lints`, per agent tier, once before the
change (on `main`, before the implementation commit, per D-d) and once after. The maintainer pays for each tier,
one tier at a time:

```bash
CLAUDE_CODE_SUBAGENT_MODEL=<agent-id> CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 \
  claude plugin eval . --case planning-plan-lints --model claude-sonnet-5-5 \
  --no-publish --scaffold --keep-temp --allow-tools Write Bash \
  --judge-model <judge> --max-cost-usd <ceiling>
```

- Session at sonnet in every column. `<agent-id>` is opus, sonnet or haiku. `<judge>` is
  `claude-sonnet-5-5`, except `claude-opus-5-5` for the sonnet column.
- `<ceiling>` = that tier's `--runs 1` pilot `costUsd` × 3 × 1.5, with the pilot under the
  fixed USD 5 cap.
- Check the agent tier in each kept trace, as `maintainer-smokes.md` § Model-class matrix
  describes.

**What to read, per tier, before and after:**

| Measure | Source | Target after |
|---|---|---|
| With-craft mean score and Δ | `aggregate-result.json` | not below before |
| `failing-test-first` | same | PASS on every with-craft run, so the rule does not cost the genuine RED |
| C1 / C2 / C3 count and clean plans | hand read of each with-craft plan's TDD steps against the T0–T3 matrix | 0 / 0 / 0, every plan clean |
| `GUARD` token use (D-c (a)) | `grep -c GUARD` on each with-craft plan | present wherever T2 or T0 is added |

The before column also includes the 10 kept plans above (1 of 10 clean). A `failing-test-first`
FAIL gets a hand read before its score is used (ADR-405 consequence).

**Optional grader-only check.** Replaying the after-plans through the faithful replay
(throwaway suite, ADR-403) only shows whether the w3 grader still disagrees with the hand read,
as it did on 21-15 with-craft run 1. It checks the grader, not the planner, so it is optional.

## Out of scope

- `agents/part-implementer.md` behaviour when a planned RED passes on arrival: no eval case
  measures it (D-a (c)).
- A new grader for RED-label accuracy: excluded under D-e (a). Revisit if the after-count is
  not clean.
- The `failing-test-first` grader wording: ADR-405 stands.
- The fixture design's "Each test is written failing before greet.sh changes": changing it
  would make before and after incomparable, and it is the pressure the rule must hold against.
- A `plan-lint` check for RED labels: whether a test passes cannot be decided from plan text.
- `docs/guides/concepts.md`'s RED → GREEN → REFACTOR diagram: `GUARD` is a label inside a part,
  not a loop stage.
- Other planner bullets (sizing, public surface): not implicated by the evidence.
