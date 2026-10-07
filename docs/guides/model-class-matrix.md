# Model-class matrix — cross-tier quality record

> Template: fill cells on a real run. See `docs/contributing/maintainer-smokes.md` §"Model-class
> matrix (cross-tier) — not CI-gated" for the procedure.

## How to refresh

Run the full pipeline across the three Claude tiers on a representative brief, record
each dimension below, and capture the harness-surfaced per-phase tokens + wall-clock
into the tables. Commit the result so the artifact is diffable across runs. The planner and
structured-review cells can be filled more cheaply by the eval sweep: see the Behavioural eval
suite and Model-class matrix sections of `docs/contributing/maintainer-smokes.md`.

---

## Tier × dimension — PASS / PARTIAL / FAIL

Dimensions (rows) follow the SP5 contract-adherence axes plus a full-pipeline row.

| Dimension | opus (`claude-opus-5-5`) | sonnet (`claude-sonnet-5-5`) | haiku (`claude-haiku-4-5`) |
|---|---|---|---|
| planner | PASS (1.00, eval) | PASS (1.00, eval) | FAIL (0.33, eval) |
| part-TDD | — (not yet run) | — (not yet run) | — (not yet run) |
| structured-review | PARTIAL (0.78, eval) | PARTIAL (0.67, eval) | PARTIAL (0.56, eval) |
| blocker | — (not yet run) | — (not yet run) | — (not yet run) |
| full-pipeline-completion | — (not yet run) | — (not yet run) | — (not yet run) |

*Eval sweep, 2026-10-07 (Claude Code 2.1.292, 3 runs per arm).* Cell = with-craft mean of
`planning-plan-lints` (planner) and `reviewer-tests-findings` (structured-review); "eval" marks a
cell from the sweep, not the full pipeline. Each trace shows the agents at the column's tier: the
sonnet and haiku columns needed `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`, as the plain override lost
to the `model: opus` pin. Δ planner / review: opus 0.00 / +0.44, sonnet 0.00 / +0.33, haiku
−0.67 / 0.00. The planner Δ counts four bare-arm `failing-test-first` FAILs (opus 1, haiku 3) as
PASS, rescored after reading plans whose `--shout` tests fail before greet.sh changes.
Structured-review loses on `findings-shape` in every run but one: spawned outside the review
phase, the reviewer gets no severity scale, and wrote CRITICAL/HIGH/MEDIUM/LOW in 1 of 3 opus
runs and 0 of 3 sonnet and haiku runs. haiku planner: in 2 of 3 runs the haiku session loaded
`craft:planning`, said the phase was running and ended its turn without spawning the planner.
haiku review: in 1 of 3 runs the reviewer could not run git in the sandbox, moved to the plugin
checkout and reviewed that instead. The reviewer Δ is mostly the bare model refusing for want of
a craft agent; haiku's bare arm once delegated to a general-purpose agent and passed. Trigger,
decisions and prune were not swept per tier. part-TDD, blocker and full-pipeline-completion need
the full-pipeline run.

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

*Last run:* 2026-10-07 — eval sweep, planner and structured-review rows only (USD 9.07 across
the three tiers, pilots included). The full-pipeline run has not been done yet.
