# Model-class matrix — cross-tier quality record

> Template: fill cells on a real run. See `docs/contributing/maintainer-smokes.md` §"Model-class
> matrix (cross-tier) — not CI-gated" for the procedure.

## How to refresh

Run the full pipeline across the three Claude tiers on a representative brief, record
each dimension below, and capture the harness-surfaced per-phase tokens + wall-clock
into the tables. Commit the result so the artifact is diffable across runs. The planner and
structured-review cells can be filled more cheaply by the eval sweep: see the Behavioural eval
suite and Model-class matrix sections of `docs/contributing/maintainer-smokes.md`. A column names
the tier the craft agents run at; the session runs at opus or sonnet (a haiku session is not
supported), and the haiku column routes the agents to haiku.

---

## Tier × dimension — PASS / PARTIAL / FAIL

Dimensions (rows) follow the SP5 contract-adherence axes plus a full-pipeline row.

| Dimension | opus (`claude-opus-5-5`) | sonnet (`claude-sonnet-5-5`) | haiku (`claude-haiku-4-5`) |
|---|---|---|---|
| planner | PASS (1.00, eval) | PASS (1.00, eval) | PASS (1.00, eval) |
| part-TDD | — (not yet run) | — (not yet run) | — (not yet run) |
| structured-review | PASS (1.00, eval) | PASS (1.00, eval) | PASS (1.00, eval) |
| blocker | — (not yet run) | — (not yet run) | — (not yet run) |
| full-pipeline-completion | — (not yet run) | — (not yet run) | — (not yet run) |

*Eval sweep, 2026-10-08 (Claude Code 2.1.293, 3 runs per arm).* Cell = with-craft mean of
`planning-plan-lints` (planner) and `reviewer-tests-findings` (structured-review); "eval" marks a
cell from the sweep, not the full pipeline. The session ran at sonnet in every column. The
columns name the agent tier. The trace check showed agent events at each column's tier. The opus
and haiku columns are not comparable with 2026-10-07, whose session ran at the column tier.
craft does not support a haiku session (README FAQ). In the 2026-10-07 sweep a haiku session
loaded `craft:planning` and ended its turn without spawning the planner. So haiku is measured as
an agent tier only. The 2026-10-07 haiku planner cell (0.33) measured that unsupported session.
Under a sonnet session the haiku planner scores 1.00. Δ planner / review: opus 0.00 / +0.67,
sonnet 0.00 / +0.67, haiku 0.00 / +0.67. The reviewer Δ is driven by the bare arm having no
craft reviewer to spawn. Reviewer severity scale, before → after (with-arm, `findings-shape`
passes of 3): opus 1.00 (3/3) → 1.00 (3/3), sonnet 0.78 (1/3) → 1.00 (3/3), haiku 0.78 (1/3) →
1.00 (3/3). Claude Code was 2.1.293 in both runs at every tier. Sandbox git: the reviewer case
reads the range's diff the scaffold writes. `gitfail` per run, with craft / bare, planner: haiku
2–8 / 1–1, sonnet 2–4 / 1–1, opus 1–2 / 1–1; reviewer: haiku 2–6 / 0–1, sonnet 1–1 / 0–1, opus
1–1 / 0–1. `left` totals: every bare run 0. Reviewer with craft: sonnet 0, opus 0, haiku 2 (one
run: a `/opt/homebrew` probe while hunting for git, and a Read of an invented path in the plugin
checkout, which permissions denied). Planner with craft: haiku 4 (two runs, each hunting for git:
`/opt`, a `PATH=/usr/local/bin:/usr/bin:/bin` string, `~/.local/bin`, `~/.n/bin`), sonnet 1 (one
run, a false positive from heredoc prose `` `PASS`/`FAIL ``), opus 2 (one run hunting for git:
`/Applications/Xcode.app`, `/Library/Developer/CommandLineTools`). No run wrote outside its
sandbox: the plugin-checkout file-time check printed nothing after every tier. Rescore: the
`failing-test-first` llm grader (sonnet judge) failed 10 plans that do add a test expected to
fail before greet.sh changes, and the maintainer rescored all 10 as PASS. They were 1 bare run
at the haiku pilot, 1 bare run at the opus pilot, and 4 runs at each of the S5 haiku and opus
tiers (1 with craft, 3 bare). Judged planner values before the rescore: haiku 0.89 with craft /
0.67 bare, opus 0.89 with craft / 0.67 bare. The grader was then recalibrated: its second sentence
now reads "Steps that add only already-passing tests, before or after that change, neither satisfy
nor fail this." Replayed through the sonnet judge on the 32 recorded plans, the old wording failed
14 and the new one fails 2; both fail all 4 hand-built plans that break the criterion. Of the 2, one
plan's RED step claims an already-passing test fails (a planner defect, kept as a known judge
disagreement); the other is a 2-1 FAIL split on a genuine PASS (noise). The values above are the
2026-10-08 measurement, unchanged. Trigger, decisions and prune were not swept per tier. part-TDD,
blocker and full-pipeline-completion need the full-pipeline run.

---

## Per-phase tokens + wall-clock

Numbers are read by the orchestrator from each phase's own sub-agent transcript, not from the
usage block a spawn returns — that block carries only the sub-agent's final message and
undercounts its true cost. No agent self-reports usage.

| Phase | Tier | subagent_tokens | duration_ms |
|---|---|---|---|
| requirements | opus | — | — |
| requirements | sonnet | — | — |
| requirements | haiku | — | — |
| design | opus | — | — |
| design | sonnet | — | — |
| design | haiku | — | — |
| decisions | opus | — | — |
| decisions | sonnet | — | — |
| decisions | haiku | — | — |
| planning | opus | — | — |
| planning | sonnet | — | — |
| planning | haiku | — | — |
| implementation | opus | — | — |
| implementation | sonnet | — | — |
| implementation | haiku | — | — |
| review | opus | — | — |
| review | sonnet | — | — |
| review | haiku | — | — |
| validation | opus | — | — |
| validation | sonnet | — | — |
| validation | haiku | — | — |
| documentation | opus | — | — |
| documentation | sonnet | — | — |
| documentation | haiku | — | — |
| propose | opus | — | — |
| propose | sonnet | — | — |
| propose | haiku | — | — |

---

*Last run:* 2026-10-08 — eval sweep, planner and structured-review rows only, agent tier per
column under a sonnet session (USD 8.78 for the probe, pilots, before runs and sweep). The
full-pipeline run has not been done yet.
