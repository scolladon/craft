# Plan — recalibrate the `failing-test-first` grader

> Source: design doc `docs/contributing/design/recalibrate-failing-test-first-grader.md` · ADRs 403, 404, 405, 406
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

**How this plan applies them.** One part. The change is eval criterion data plus two prose
surfaces (R1, R2, R3 of the design): three files, three edit cycles, no `engine/src/` delta, no
code a test can exercise. Splitting it would pay three agent lifecycles for three text edits
whose verbatim bytes the design already fixes.

- **No unit-test RED, stated honestly.** No test, script or engine code reads the grader text
  (`grep -rn failing-test-first test engine scripts` finds nothing), and the design's Test
  strategy rules out a string-equality test: it would only restate the file. Each RED below is
  a grep that proves the new text is absent before the edit and present once after it; the
  behavioural evidence is the faithful replay already run and paid (design § Context, pinned
  results table), which is not re-run.
- **R4 is not a part.** Closing the BACKLOG entry "Recalibrate the `failing-test-first`
  grader" in the house form and adding the 2026-10-07T21-15 with-craft run 1 evidence sentence
  to the entry "The planner labels an already-passing test as RED" (BACKLOG.md, l. 200 and
  l. 227) belong to the documentation phase. The part must not touch `BACKLOG.md`.
- **README corpus count.** The plan commit already bumps README.md l. 180 from
  "[32 parted plans]" to "[33 parted plans]". The part does not touch README.md: it adds no
  design doc, plan or ADR.

**Public surface.** The plan introduces no exported code symbol. Non-code surfaces it edits and
their downstream gates, pre-paid in Part 1:

| Surface | Downstream gates |
|---|---|
| `evals/planning-plan-lints/graders/failing-test-first.md` (criterion data read only by `claude plugin eval`) | touched-`.md` prose lint (ci `run_prose_lint`); touched-diff stub lint; nothing else reads it |
| `docs/contributing/maintainer-smokes.md` § Behavioural eval suite | `test/plugin-evals-local-only.test.js` (fenced `claude plugin eval` lines must carry `--no-publish` and `--max-cost-usd`; the new bullet carries no fence, keep it that way); `docs-structure-lint docs/contributing`; touched-`.md` prose lint |
| `docs/guides/model-class-matrix.md` "Rescore" note | `test/plugin-evals-local-only.test.js` (guides are an agent-facing scan root: no fenced eval command may be added); `docs-structure-lint docs/guides` and `--audience docs`; touched-`.md` prose lint |

**Binding for the part.**

- No part runs `claude plugin eval` or any judge replay (paid; the evidence is complete).
- No provenance references (ADR numbers, phase/part numbers, backlog ids) in the grader file.
  The two docs carry the design's verbatim text, which cites none.
- No suppression directives. Commit only the three files named (`git add <path>…` +
  `git commit`); never touch the branch, the index beyond your own adds, the stash or other
  files.
- Any command whose output may exceed ~100 lines writes to a scratch file; read back with
  `tail`/`grep`. `bash scripts/ci.sh` must be green before the commit.
- Avoid the prose-lint ban list (`engine/src/prose-lint-main.js` `BAN_LIST`: delve, leverage,
  seamless, robust, "it's important to note", "in conclusion") in every touched `.md`. The
  design's verbatim text already avoids it.

## Decision candidates

Plan-level choices the design and ADRs leave open. Part 1 is written against the
recommendation; the alternative is swappable inside its GREEN step 3.

| # | Choice | Alternatives (≤3) | Recommendation | Why |
|---|---|---|---|---|
| 1 | Where the matrix recalibration text goes inside the "Rescore" sentence group. The design says both "appended to the 'Rescore' sentence group" and "after '(1 with craft, 3 bare).'", but the group continues past that point: the next sentence, "Judged planner values before the rescore: haiku 0.89 with craft / 0.67 bare, opus 0.89 with craft / 0.67 bare.", belongs to it | (a) at the end of the group, after "opus 0.89 with craft / 0.67 bare." and before "Trigger, decisions and prune were not swept per tier."; (b) literally after "(1 with craft, 3 bare).", before "Judged planner values before the rescore" | **(a)** | (b) splits the rescore from its own before-values: the recalibration text would sit between them, "before the rescore" would follow a paragraph about a different change, and the closing "The values above are the 2026-10-08 measurement, unchanged." would precede more 2026-10-08 values. (a) appends to the group, which matches the design's first wording, and keeps every inserted word verbatim. |

## Part 1 — Reword the grader, document the faithful replay, record the recalibration

### Context

Files this part edits (three):

- `evals/planning-plan-lints/graders/failing-test-first.md` — 6 lines today, ends with one
  newline. Frontmatter l. 1–5 unchanged (`---`, `type: llm`,
  `focus: {source: file, path: docs/plan/shout-flag.md}`, `arm: both`, `---`). Body l. 6
  today (w0):
  "Before any step that changes greet.sh, the plan has a step that adds a test expected to fail
  against the current greet.sh. Tests added after that change do not fail this."
  The body is one physical line; keep it one line.
- `docs/contributing/maintainer-smokes.md` — § "## Behavioural eval suite — not CI-gated"
  (l. 15), sub-block "**Reading results.**" (l. 109). Its last bullet, "- Keep one clause per
  `llm` grader. …", spans l. 123–125 and ends "  both halves once split."; l. 126 is blank;
  l. 127 opens "**Evidence, not gate.**". The new bullet goes on l. 126, directly after l. 125,
  so the blank line then separates it from "**Evidence, not gate.**". Bullet continuation lines
  are indented two spaces; lines in this block run to ~97 characters.
- `docs/guides/model-class-matrix.md` — the note paragraph under the tier × dimension table,
  "*Eval sweep, 2026-10-08 …*". The "Rescore" sentence group starts at l. 51 ("Rescore: the")
  and l. 51–57 read today:

  ```markdown
  sandbox: the plugin-checkout file-time check printed nothing after every tier. Rescore: the
  `failing-test-first` llm grader (sonnet judge) failed 10 plans that do add a test expected to
  fail before greet.sh changes, and the maintainer rescored all 10 as PASS. They were 1 bare run
  at the haiku pilot, 1 bare run at the opus pilot, and 4 runs at each of the S5 haiku and opus
  tiers (1 with craft, 3 bare). Judged planner values before the rescore: haiku 0.89 with craft /
  0.67 bare, opus 0.89 with craft / 0.67 bare. Trigger, decisions and prune were not swept per
  tier. part-TDD, blocker and full-pipeline-completion need the full-pipeline run.
  ```

  l. 58 is blank. Only l. 56–57 change (decision candidate 1, option (a)); l. 51–55 stay
  byte-identical. The measured 2026-10-08 values (table cells and the note's numbers) stay as
  they are.

Read-only references (do not edit): the design doc
docs/contributing/design/recalibrate-failing-test-first-grader.md § Design (source of every
verbatim string below); ADRs 403 (validate rewordings through the real judge), 404 (harness
stays throwaway, one bullet in maintainer-smokes), 405 (adopt w3; residuals), 406 (evidence
pointer placement, consumed by R4 in the documentation phase) under docs/contributing/adr/;
test/plugin-evals-local-only.test.js (fence parser); engine/src/prose-lint-main.js (`BAN_LIST`).

Settled facts the part writes down, from the design (do not recompute): the faithful replay
graded 32 recorded genuine-PASS plans and 4 hand-built negatives with the real sonnet judge;
w0 failed 14 of 32, w3 fails 2 of 32, both fail 4 of 4 negatives; a `claude -p` replay
reproduced 0 of 10 real false FAILs. The 2 w3 residuals: 2026-10-07T21-15 with-craft run 1
(its RED step claims an already-passing test fails; a planner defect, a known judge
disagreement) and 2026-10-08T06-13 bare run 1 (a 2-1 FAIL split on a genuine PASS; noise).

### TDD steps

RED (run all three before any edit; each must print the stated "before" value):

1. Grader: `grep -c 'Steps that add only already-passing tests' evals/planning-plan-lints/graders/failing-test-first.md`
   prints 0 (the w3 sentence is absent), and
   `grep -c 'Tests added after that change do not fail this.' evals/planning-plan-lints/graders/failing-test-first.md`
   prints 1 (w0 is present). Expected failure reason: the body is still w0.
2. Maintainer smokes: `grep -c 'grader against the real judge, not' docs/contributing/maintainer-smokes.md`
   prints 0. Expected failure reason: the replay method is not documented.
3. Matrix: `grep -c 'The grader was then recalibrated' docs/guides/model-class-matrix.md`
   prints 0. Expected failure reason: the note records only the rescore.

GREEN, in order:

1. Replace l. 6 of `evals/planning-plan-lints/graders/failing-test-first.md` so the file reads
   exactly (w3, one body line, trailing newline kept):

   ```text
   ---
   type: llm
   focus: {source: file, path: docs/plan/shout-flag.md}
   arm: both
   ---
   Before any step that changes greet.sh, the plan has a step that adds a test expected to fail against the current greet.sh. Steps that add only already-passing tests, before or after that change, neither satisfy nor fail this.
   ```

   Check: RED 1 now prints 1 and 0; `git diff --no-ext-diff -U0 -- evals/planning-plan-lints/graders/failing-test-first.md`
   shows a single `-`/`+` pair on l. 6; `wc -l` prints 6.
2. Insert this bullet into `docs/contributing/maintainer-smokes.md` directly after l. 125
   ("  both halves once split."), before the blank l. 126, verbatim from the design:

   ```markdown
   - Check a reworded `llm` grader against the real judge, not `claude -p`: the judge runs with no
     tools, thinking or session context, and a `claude -p` replay reproduced 0 of 10 real false FAILs.
     Use a throwaway suite with one case per kept plan, whose scaffold copies the plan to the focus
     path, prompt "Reply with the single word OK. Do not use any tools.", and one grader per wording.
     Run `--ablation none --runs 1 --scaffold --judge-model <sweep judge>`. `case.yaml` holds only
     `schema_version` and `context.scaffold_script`; frontmatter and prompt go in `prompt.md`.
   ```

   Do not fence it and do not add `claude plugin eval` anywhere in the bullet: the fenced-command
   test would then require `--no-publish` and `--max-cost-usd`. Check: RED 2 prints 1;
   `grep -n 'Check a reworded' docs/contributing/maintainer-smokes.md` reports l. 126; the line
   after the bullet's last line is blank, then "**Evidence, not gate.**".
3. In `docs/guides/model-class-matrix.md`, replace l. 56–57 (the two lines after
   "tiers (1 with craft, 3 bare). Judged planner values before the rescore: haiku 0.89 with craft /")
   with these eight lines, reflowed at ≤100 characters with every word unchanged:

   ```markdown
   0.67 bare, opus 0.89 with craft / 0.67 bare. The grader was then recalibrated: its second sentence
   now reads "Steps that add only already-passing tests, before or after that change, neither satisfy
   nor fail this." Replayed through the sonnet judge on the 32 recorded plans, the old wording failed
   14 and the new one fails 2; both fail all 4 hand-built plans that break the criterion. Of the 2, one
   plan's RED step claims an already-passing test fails (a planner defect, kept as a known judge
   disagreement); the other is a 2-1 FAIL split on a genuine PASS (noise). The values above are the
   2026-10-08 measurement, unchanged. Trigger, decisions and prune were not swept per tier. part-TDD,
   blocker and full-pipeline-completion need the full-pipeline run.
   ```

   If the orchestrator passes decision candidate 1 option (b) instead: insert the same four
   design sentences ("The grader was then recalibrated: …" through "… measurement, unchanged.")
   after "tiers (1 with craft, 3 bare)." on l. 55 and reflow l. 55–57 at ≤100 characters, words
   unchanged. Either way check: RED 3 prints 1; `git diff --no-ext-diff --word-diff -- docs/guides/model-class-matrix.md`
   shows only added words, none removed.

REFACTOR: none expected. Confirm the three diffs touch nothing outside the lines named above
(`git diff --no-ext-diff --stat` lists exactly the three files), and that no touched `.md`
holds a `BAN_LIST` word.

### Gate

`bash scripts/ci.sh > "$TMPDIR/ci-part1.log" 2>&1; echo $?` must print 0. On non-zero, read only
the failing lines (`grep -n 'not ok\|ci:\|SLOP-FOUND\|error' "$TMPDIR/ci-part1.log" | head -40`).
The suites that cover the touched files run inside it: `test/plugin-evals-local-only.test.js`,
the touched-diff stub lint and prose lint, `docs-structure-lint` over docs/contributing,
docs/guides and `--audience docs`, readme-drift (unchanged by this part).

### Commit

`fix(evals): recalibrate the failing-test-first grader to ignore already-passing test steps`
