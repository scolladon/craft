# Design — planner RED-label audit

> Brief: audit `agents/planner.md` so `craft:planner` never labels a test RED, or says it is
> expected to fail, when that test already passes against the code as it stands at that step.
> Status: draft → self-reviewed ×3 → revised: implementer contract folded in (ADR-412), evidence
> rubric restated at test granularity, fresh before-runs counted

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
  agent other than the planner names "RED entries".
- `contracts/construction.md` line 1, the implementer's TDD rule, has no exception for a test
  that passes by design:

  ```
  RED→GREEN→REFACTOR strictly: write the test first, run it (it must fail for the stated reason), then write minimal code to pass, then refactor. Never write implementation before its failing test.
  ```

  `engine/src/contract.js` `assembleContract` pushes the fragment verbatim
  (`sections.push(fragments[bundleName])`), and only the `implementation` phase of
  `pipeline/default.yml` carries `contract: [construction]`; `engine/bin/contract-assemble.js`
  is the spawn-time entry point. So the line reaches every part-implementer spawn and no
  other. `engine/test/contract-equivalence.test.js` `PHASE_EXPECTATIONS.construction` pins
  three case-insensitive substrings of the real file: `RED→GREEN→REFACTOR`, `atomic commit`,
  `sut`. `engine/test/scenarios.test.js` reads the real file into `REAL_FRAGMENTS` but asserts
  only core markers and the producer bundle on the planning descriptor, so it pins no
  construction text; its `FRAGMENTS.construction` is the three-line fixture
  `engine/test/fixtures/contracts/construction.md`, untouched here. No contract fragment uses
  backticks.
- `agents/part-implementer.md` line 16, the handback, counts only RED/GREEN cycles:
  `- Final message: the commit hash + one line per RED/GREEN cycle, plus any deferred observations.`
  Its six mirrors `adapters/<adapter>/agents/craft-part-implementer.md` carry the body byte for
  byte through the same `scripts/sync-adapter-agents.sh` (54 mirrors across 6 adapters, all
  in sync today). No test pins the line.

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

**Resolving a GREEN given only in prose.** Most plans describe a GREEN without its code
("build the greeting once"). The count assumes the minimal edit that keeps the script's
existing `${1:-world}`, so T3 passes after any GREEN that shifts the flag, unless the plan's
own GREEN text says otherwise (a bare `$1`, or "no default yet"). No kept plan says
otherwise; several print `${1:-world}` in their `### Context` shape.

**Before evidence, read by hand.** Two sources, both produced by the pre-change
`agents/planner.md` and `templates/plan.md`:

- *Kept plans*: every with-craft plan kept in the four result directories under
  `~/craft-eval-results/` (2026-10-07T07-35, 2026-10-07T21-15, 2026-10-08T06-13,
  2026-10-08T06-34). 07-35 with-0 and with-2 kept no plan text: 10 plans. Their scores predate
  the `failing-test-first` recalibration and are not used.
- *Fresh runs* on `main` at `74cace6` (D-d (a)), session at sonnet, agents forced to the
  tier: 2026-10-08T13-33 (sonnet agents, opus judge, USD 1.11), 2026-10-08T14-07 (opus
  agents, sonnet judge, USD 1.31), 2026-10-08T14-17 (haiku agents, sonnet judge, USD 0.99):
  9 plans. Their scores are in Test strategy.

**Rubric, per test.** Each test is judged at the step that writes it, against that step's
*baseline*: the original `greet.sh` plus every GREEN in an earlier step, each resolved by the
rule above. A GREEN later in the same step is not in the baseline. The label belongs to the
test, not the step.

- **C1 false failure claim:** the test passes against its baseline, and the plan says it
  fails there (as a statement, or as the failure the run shows).
- **C2 RED label on a passing test:** the test passes against its baseline, has no C1, and
  is labelled RED, either explicitly or by sitting in a RED-headed step, without being named
  as passing or as a guard. A hedge ("if step 2 already makes it pass…") does not name it
  passing. A guard or passing name given only conditionally ("if it passes, keep it as a
  guard", "or note it as a characterisation test") is a hedge too and does not exempt the
  test; only an unconditional name ("either way", "passes already") does. A test named
  unconditionally as passing or as a guard is not C2, whatever its step heading:
  "RED 2", "RED/guard" and "RED 2 (regression guard)" headings over a declared guard are
  not counted.
- **C3 break-to-prove:** a step changes code (the script or the test's own assertion)
  temporarily, or runs the test against another version of the code (`git stash`, "a version
  without the default"), to watch a test that passes against its baseline fail.
- **Precedence:** C1 wins over C2. A test with a false failure claim counts as C1 only. C3 is
  counted independently and can sit on the same test as C1 or C2.
- **Counts are per plan:** a plan counts once per class, however many tests carry it. A
  plan is clean when no test in it carries C1, C2 or C3.
- **Ordering (D-b (b)):** per plan, yes when T3 is a RED placed before the GREEN that
  handles the no-name case (under the resolution rule, the first GREEN that shifts the flag).

One worked example per class, from the plans:

| Class | Plan, step | Why |
|---|---|---|
| C1 | 21-15 with-1, step 1: one RED step for T1–T3, "All three tests fail" | T2 passes against the original script |
| C1 over C2 | 07-35 with-1, "RED 2": T2 "currently fails" | T2 passes after GREEN 1; RED label and failure claim both apply, counted C1 only |
| C2 | 06-13 with-1, step 3 "RED": T3, "If step 2 already passes it, record that it was green on arrival and keep the test as a regression guard" | step 2's GREEN reads `${1:-world}`, so T3 passes; the guard name is conditional, so it is a hedge |
| not C2 | 21-15 with-0, "RED 2": T2, "passes against the unchanged script … (not a RED)" | named as passing; the heading does not count |
| C3 | 14-07 with-2, step 3: T3 run against the original via `git stash` after GREEN 2 | T3 passes against its baseline; the step runs it against another version |

| Run (agent tier) | Plan | C1 | C2 | C3 | Clean | T3 RED before its GREEN |
|---|---|---|---|---|---|---|
| 2026-10-07T07-35 (haiku session) | with-1 | RED 2: T2 "currently fails" | RED 3: T3 hedged ("should pass if default name handling is correct; if not, fails") | no | no | no |
| 2026-10-07T21-15 (sonnet) | with-0 | no | no ("RED 2" heading on a T2 named "not a RED") | no | **yes** | yes |
| | with-1 | step 1: "All three tests fail", T2 included | no | no | no | yes |
| | with-2 | no | no (T2 named a passing guard inside the RED step) | no | **yes** | yes |
| 2026-10-08T06-13 (sonnet agents) | with-0 | no | step 3: T3 hedged (step 4's "RED/regression guard" T2 and T0 are named guards) | step 3 "flip to confirm" | no | no |
| | with-1 | no | step 3: T3 hedged (step 4's "RED/guard" T2 is named passing) | no | no | no |
| | with-2 | no | RED 3: T3 after GREEN 1 | RED 2 "temporarily making the flag unconditional" (T2); RED 3 "write it before handling the default", although GREEN 1 reads `${1:-world}` (T3) | no | no |
| 2026-10-08T06-34 (opus agents) | with-0 | no | step 3: T3 "If the GREEN step already used `${1:-world}` … passes immediately" | "briefly swap to `$1`, see `not ok`, revert" (T3) | no | no |
| | with-1 | no | step 3: T3, same hedge | "temporarily checking it fails against a version without the default" (T3) | no | no |
| | with-2 | no | no (step 4 T3: "Record it as a guard test either way") | no | **yes** | no |
| 2026-10-08T13-33 (sonnet agents) | with-0 | no | no (T2, T0 "PASS already … regression guards … not RED") | no | **yes** | yes |
| | with-1 | no | no (T2 "a regression guard, not a RED") | no | **yes** | yes |
| | with-2 | no | no (T2, T0 "pass") | no | **yes** | yes |
| 2026-10-08T14-07 (opus agents) | with-0 | no | no (step 3 T2 "Regression guard … not a RED") | no | **yes** | yes |
| | with-1 | no | step 4: T3 "if step 3 used `${1:-world}` … this already passes — that is acceptable" | step 1: "temporarily assert `"Hello, Ada?"`" against a passing T2 | no | no |
| | with-2 | no | step 3: T3 after GREEN 2; step 5: bash-4 syntax check, passing with the `tr` code | step 3 `git stash` (T3); step 5 "temporarily inserting a `${x^^}`" (syntax check) | no | no |
| 2026-10-08T14-17 (haiku agents) | with-0 | step 1: "expect all three to fail", T2 included | no | no | no | yes |
| | with-1 | RED: T2 "(fails: arg parsing breaks)" | no | no | no | yes |
| | with-2 | RED 1: T2 "currently fails; script doesn't accept name after flag parsing" | no | no | no | yes |

| Source | Plans | Clean | C1 | C2 | C3 | Ordering yes |
|---|---|---|---|---|---|---|
| Kept | 10 | 3 | 2 | 6 | 4 | 3 |
| Fresh 13-33 (sonnet) | 3 | 3 | 0 | 0 | 0 | 3 |
| Fresh 14-07 (opus) | 3 | 1 | 0 | 2 | 2 | 1 |
| Fresh 14-17 (haiku) | 3 | 0 | 3 | 0 | 0 | 3 |
| **Pooled before** | **19** | **7** | **5** | **8** | **6** | **10** |

Per tier, descriptive only: sonnet 5 of 9 clean (21-15 2, 06-13 0, 13-33 3), ordering 6 of 9;
opus 2 of 6 clean (06-34 1, 14-07 1), ordering 1 of 6; haiku 0 of 3 clean, ordering 3 of 3.
The 07-35 plan came from a haiku session with no tier forced, so it sits in the pooled count
only, in no tier row.

What the matrix shows:

- C2 is always T3 placed after the GREEN that already satisfies it (8 plans), plus a passing
  syntax check in 14-07 with-2. A passing T2 or T0 under a RED heading is, in every plan,
  named as passing, so it is never C2. A passing T2 shows up only as C1 (5 plans).
- C3 sits on T3 in 5 plans, on T2 in 2 (06-13 with-2, 14-07 with-1), and on the syntax check
  in one. The T3 shape is the BACKLOG entry's "temporarily remove the `shift`".
- Ordering and labels move together: of the 9 plans where T3 is not a RED before its GREEN,
  8 are not clean. The one exception, 06-34 with-2, names T3 a guard, so its T3 never fails.
- The haiku C1 is a different shape: one RED step that claims every test fails, with
  invented reasons for T2 ("arg parsing breaks").

**The contract frames every test as RED.** A crude grep, not a hand read: the word `RED`
appears in 19 of 19 with-craft plans and in 6 of 21 bare plans from the same runs. The bare
arm does not read `agents/planner.md`. The likely cause: "RED entries → GREEN" is the only
label the contract offers, so every test step gets it. `GUARD` appears in none of the 40.

## Requirements

- **R1.** The `agents/planner.md` TDD bullet states: a RED test fails against the code as it
  stands at its step, after every earlier GREEN; a test that passes there carries the non-RED
  label chosen in D-c and is never called RED or expected to fail; no step changes code to
  watch a passing test fail. The ordering clause is included or left out per D-b. The bullet
  stays at most 6 lines, and no other line of the file changes.
- **R2.** The six adapter mirrors of each edited agent (`craft-planner.md`, and under R5
  `craft-part-implementer.md`) equal the new body: `bash scripts/sync-adapter-agents.sh
  --check` exits 0.
- **R3.** Under D-a (b) or (c), the `templates/plan.md` `### TDD steps` comment names the same
  label and says a passing test is never RED. Under D-a (a) the template is unchanged.
- **R4.** The behavioural evidence (Test strategy) is recorded before the BACKLOG entry "The
  planner labels an already-passing test as RED" closes. The documentation phase closes it in
  the house form `**<title> — delivered <date>**` with the pooled before and after hand
  counts, the decision-rule verdict, and the per-tier rows and with-craft scores as
  description.
- **R5.** Per ADR-412, `contracts/construction.md` line 1 gains a `GUARD` clause: a plan
  `GUARD` entry is written, run, and confirmed passing for its stated reason; it owes no
  failure and no GREEN; no step breaks code to watch it fail. `agents/part-implementer.md`
  line 16 reports one line per RED/GREEN cycle and per `GUARD`. Line 1 stays one line and
  keeps the `RED→GREEN→REFACTOR` marker; no other line of either file changes.

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
| "`GUARD` entry … never RED" | C2: a passing test left under a RED label with no guard name; also the "RED/guard" hybrid headings the rubric tolerates |
| "Put a new-behaviour test before the GREEN that satisfies it" | the cause of C2 and C3 for T3, which then becomes a real RED, as in 21-15 with-0 and with-2 |
| "No step breaks code to watch a test fail" | C3 |

Under D-b (a) the fourth sentence is dropped. T3 after GREEN 1 then becomes a correctly
labelled `GUARD`, but requirement 3 never has a failing test.

**Edge behaviour.**

- *A step with several tests* (21-15 with-2, 06-34 with-1 step 1): allowed. The label
  belongs to the test, not the step: the step adds a RED test and names each passing test as
  a `GUARD` in the same step. 21-15 with-2 and the three 13-33 plans already have this shape.
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

**Implementer contract (R5).** `contracts/construction.md` line 1 becomes one line:

```
RED→GREEN→REFACTOR strictly: write the test first, run it (it must fail for the stated reason), then write minimal code to pass, then refactor. Never write implementation before its failing test. A plan GUARD entry is written, run, and confirmed passing for its stated reason: it owes no failure and no GREEN, and no step breaks code to watch it fail.
```

The first two sentences are unchanged; the third is ADR-412's decision text. `GUARD` is bare,
because no contract fragment uses backticks and the token still greps. The line keeps
`RED→GREEN→REFACTOR`, so `contract-equivalence.test.js` stays green with no test edit.

| Clause | Closes |
|---|---|
| "written, run, and confirmed passing for its stated reason" | a `GUARD` taken on trust: the implementer still runs it and checks the stated reason by reading the code at its step, never by a run that breaks code |
| "it owes no failure" | the conflict with "it must fail for the stated reason": a blocker handback on a `GUARD`, or a refused refactor |
| "and no GREEN" | a GREEN written for a test that already passes (06-34 with-0 step 4, 14-07 with-1 step 5) |
| "no step breaks code to watch it fail" | C3 moved from the plan into the implementer |

**Implementer handback (R5).** `agents/part-implementer.md` line 16 becomes:

```markdown
- Final message: the commit hash + one line per RED/GREEN cycle and per `GUARD`, plus any deferred observations.
```

The agent body uses backticks, as `agents/planner.md` does for `GUARD`. Mirrors: edit
`agents/part-implementer.md` only, then `bash scripts/sync-adapter-agents.sh --write`
regenerates `adapters/<adapter>/agents/craft-part-implementer.md`.

**Contract edge behaviour.**

- *A `GUARD` that fails on arrival* (the plan assumed an earlier GREEN the implementer
  wrote differently): the test failed before its code, so it is a RED under the first
  sentence. The implementer writes its GREEN, reports it as a RED/GREEN cycle, and notes the
  plan mismatch as a deferred observation. No blocker: the outcome is TDD-consistent.
- *A planned RED that passes on arrival*: unchanged. The first sentence still requires a RED
  to fail, so it stays a blocker under the same protocol.
- *A part made only of `GUARD` entries*: "Never write implementation before its failing
  test" holds trivially, because such a part writes no implementation; the refactor runs
  against green guards.
- *A plan with no `GUARD`*: the clause is inert, and the contract reads as before.

**Delivery shape.** Two parts.

- *Part 1*: `agents/planner.md`, `templates/plan.md` and the six regenerated
  `craft-planner.md` mirrors. The part's `### Context` backticks only `agents/planner.md` and
  `templates/plan.md` and names the mirrors in plain text as outputs of the sync script: eight
  backticked paths would exceed plan-lint's per-part ceiling of 6.
- *Part 2*: `contracts/construction.md` line 1, `agents/part-implementer.md` line 16 and the
  six regenerated `craft-part-implementer.md` mirrors. `### Context` backticks the two edited
  files and names the mirrors in plain text, plus `engine/test/contract-equivalence.test.js`
  in plain text as the marker pin. It follows Part 1 because the contract names a plan
  `GUARD` entry, which Part 1 introduces. It stays a separate part because it changes a
  different role's contract and reverts on its own.

Each part's gate is `bash scripts/ci.sh`, which runs `sync-adapter-agents.sh --check` and the
engine suite, `contract-equivalence.test.js` included. The paid before and after runs sit
outside both parts (Test strategy).

## Decision candidates

None of these was settled by ADR-405 or ADR-406. All five are ratified as recommended: D-a
as ADR-407, D-b ADR-408, D-c ADR-409, D-d ADR-410, D-e ADR-411. ADR-412 settles D-a's
implementer side beyond (c): the contract clause and the handback slot (R5). None is reopened
here.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| D-a | Which prompt surfaces carry the rule | (a) `agents/planner.md` only; (b) `agents/planner.md` plus the `templates/plan.md` TDD comment; (c) (b) plus a line in `agents/part-implementer.md` on a planned RED that passes on arrival | **(b)**; implementer side settled by ADR-412 | The planner reads the template on every run and copies its prose into plans. Under (a) the template still says "RED entries" with no other label, which contradicts the agent. (c) changes a unit with no eval case behind it (`agents/part-implementer.md` is not in the "Evidence, not gate" table), so it would ship without evidence. ADR-412 accepts that cost for the contract line and handback, because `contracts/construction.md` otherwise binds the implementer to fail every `GUARD`. |
| D-b | What the rule asks | (a) label only: a passing test is a `GUARD`, never RED, and no break-to-prove step; (b) (a) plus ordering: put a new-behaviour test before the GREEN that satisfies it; (c) ordering only | **(b)** | (a) makes the labels honest but leaves T3 with no failing test, because GREEN 1 does more than it has to. (b) gives T3 a real RED and matches both reference plans (21-15 with-0, with-2). (c) leaves C1 and C2 for T2, which no ordering can make fail. Cost of (b): one more sentence. |
| D-c | The label for a passing test | (a) a fixed token `GUARD`; (b) free prose such as "regression guard (not a RED)"; (c) a fixed token `CHARACTERISATION` | **(a)** | A fixed token can be grepped in a plan and is easy for the model to recall. 8 of the 10 kept plans already use the word "guard". Free prose is what produced the "RED/guard" hybrids. Characterisation means pinning legacy behaviour before a refactor, which is narrower than a requirement guard such as T2. |
| D-d | The "before" baseline | (a) a fresh `planning-plan-lints` run per tier on the unchanged tree, with the 10 kept plans added to the hand count; (b) the kept plans only, then after-runs per tier; (c) one sonnet after-run, compared with the kept plans | **(a)** | The kept plans are valid before-plans for the hand count (same `agents/planner.md` and template). Their scores are not: they were graded before the `failing-test-first` recalibration. Haiku has no kept plan from a sonnet session either. (b) saves about half the spend but compares scores across two grader versions. (c) cannot show a per-tier effect. |
| D-e | How RED-label accuracy is measured | (a) by hand, using the C1/C2/C3 count; (b) a new one-clause `llm` grader in `planning-plan-lints`, checked against the 10 hand-read plans through the faithful replay (ADR-403); (c) both | **(a)** | Each tier's after-run produces 3 with-craft plans, so a hand read is cheap. A grader needs its own paid replay and adds a column to every future sweep. That spend is worth it only if the after-count still shows mislabels. ADR-405 keeps `failing-test-first` itself blind to passing steps. |

## Test strategy

No automated test pins planner or implementer prose, and none is added. The bullet, the
contract clause and the handback line are prompt text, and a string-equality test would only
repeat the file. That matches the `failing-test-first` grader decision. The one existing pin,
`contract-equivalence.test.js`'s `RED→GREEN→REFACTOR` marker, survives because line 1 keeps
it.

**CI gate.** `bash scripts/ci.sh` green: `sync-adapter-agents.sh --check` (planner and
part-implementer mirror drift), the engine suite (the construction marker pin), design-lint
over this doc, readme-drift (corpus count), and prose-lint over touched README prose.

**Behavioural evidence, not a gate.** `planning-plan-lints`, per agent tier, once before the
change (on `main`, before the implementation commit, per D-d; done at `74cace6`, see Context)
and once after. The maintainer pays for each tier, one tier at a time:

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

`planning-plan-lints` measures the planner only. Part 2 (the implementer contract) has no
behavioural evidence here (Out of scope).

**Headline: the pooled hand count.** The after pool is the 9 with-craft plans of the three
after-runs, read with the Context rubric (resolution rule, C1/C2/C3, precedence, ordering).

- **Decision rule:** the change shows an effect if at least 8 of the 9 after-plans are clean,
  against the before pool's 7 of 19. At the before rate, 8 or 9 clean plans out of 9 by
  chance has a probability of about 0.2%, an indicative figure that assumes independent
  plans. Plans within one run move together (sonnet runs went 2, 0 and 3 of 3 clean), so
  the effective sample is nearer 3 runs than 9 plans; the threshold rests on the per-tier
  before rates (haiku 0 of 3, opus 2 of 6) as much as on that figure. Fewer than 8 clean: no effect shown. The BACKLOG
  entry then stays open with the counts, and ADR-411's consequence applies (a dedicated
  grader becomes worth its replay cost).
- **Ordering:** read the same way: at least 8 of 9 after-plans with T3 a RED before its
  GREEN, against the before 10 of 19. Clean without ordering means the label clause worked
  and the ordering clause did not (the D-b (a) outcome).

| Measure | Source | Before (pooled 19) | Reading after |
|---|---|---|---|
| Clean plans | hand read, Context rubric | 7 of 19 | headline: decision rule above |
| C1 / C2 / C3 plans | same | 5 / 8 / 6 | descriptive |
| T3 RED before its GREEN | same | 10 of 19 | decision rule above, as a second reading |
| Passing tests labelled with the `GUARD` token | same, per test | 0 (token absent) | descriptive; a passing test named a guard in prose is not C2 |
| Plans containing `GUARD` | `grep -c GUARD` per plan | 0 of 19 | descriptive adoption count |

**Per tier, descriptive only.** Three plans per tier per side cannot separate an effect from
run-to-run noise (ADR-410), so these rows carry no target:

| Tier | Before clean | Before ordering | With-craft / without / Δ | `failing-test-first`, with-craft |
|---|---|---|---|---|
| sonnet (21-15, 06-13, 13-33) | 5 of 9 (2, 0, 3) | 6 of 9 | 13-33: 1.00 / 1.00 / 0.00 | PASS ×3 |
| opus (06-34, 14-07) | 2 of 6 (1, 1) | 1 of 6 | 14-07: 1.00 / 1.00 / 0.00 | PASS ×3 |
| haiku (14-17) | 0 of 3 | 3 of 3 | 14-17: 0.67 / 0.89 / −0.22 | FAIL ×3 |

The 07-35 haiku-session plan counts in the pooled 19 only. Kept-plan scores are not shown:
they predate the grader recalibration (D-d). The score and Δ are descriptive: both arms sit at
the 1.00 ceiling for two tiers, so the score cannot show an improvement there.

**`failing-test-first` FAILs get a hand read before their score is used** (ADR-405
consequence). The three haiku before-FAILs: each plan's single RED step adds T1 and T3,
failing against the current `greet.sh`, before the GREEN. That meets the grader's wording,
so the hand read disagrees with the judge. The FAILs coincide with the C1 claim on T2. The
haiku 0.67 is therefore not read as a RED-label signal, and an after-run PASS there is not
counted as an effect. After the change, a with-craft FAIL that the hand read confirms (no
RED before the first GREEN) means the rule cost the genuine RED.

**Optional grader-only check.** Replaying the after-plans through the faithful replay
(throwaway suite, ADR-403) only shows whether the w3 grader still disagrees with the hand read,
as it did on 21-15 with-craft run 1 and on the three haiku before-runs. It checks the grader,
not the planner, so it is optional.

## Out of scope

- A behavioural eval case for the part-implementer on a `GUARD` entry or on a planned RED
  that passes on arrival: no case exists, and ADR-412 ships the contract on reasoning. A
  reviewer or an implementation-phase observation is the only evidence until a case
  measures it.
- Other lines of `contracts/construction.md` and `agents/part-implementer.md`: only line 1
  and line 16 change (R5).
- A new grader for RED-label accuracy: excluded under D-e (a). Revisit if the decision rule
  shows no effect.
- The `failing-test-first` grader wording: ADR-405 stands.
- The fixture design's "Each test is written failing before greet.sh changes": changing it
  would make before and after incomparable, and it is the pressure the rule must hold against.
- A `plan-lint` check for RED labels: whether a test passes cannot be decided from plan text.
- `docs/guides/concepts.md`'s RED → GREEN → REFACTOR diagram: `GUARD` is a label inside a part,
  not a loop stage.
- Other planner bullets (sizing, public surface): not implicated by the evidence.
