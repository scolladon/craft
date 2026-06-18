# Model-class matrix — cross-tier quality record

> Template: fill cells on a real run. See `skills/run/SKILL.md` §"Model-class matrix
> (cross-tier) — not CI-gated" for the procedure.

## How to refresh

Run the full pipeline across the three Claude tiers on a representative brief, record
each dimension below, and capture the harness-surfaced per-phase tokens + wall-clock
into the tables. Commit the result so the artifact is diffable across runs.

---

## Tier × dimension — PASS / PARTIAL / FAIL

Dimensions (rows) follow the SP5 contract-adherence axes plus a full-pipeline row.

| Dimension | opus (`claude-opus-4-8`) | sonnet (`claude-sonnet-4-6`) | haiku (`claude-haiku-4-5-20251001`) |
|---|---|---|---|
| planner | — (not yet run) | — (not yet run) | — (not yet run) |
| slice-TDD | — (not yet run) | — (not yet run) | — (not yet run) |
| structured-review | — (not yet run) | — (not yet run) | — (not yet run) |
| blocker | — (not yet run) | — (not yet run) | — (not yet run) |
| full-pipeline-completion | — (not yet run) | — (not yet run) | — (not yet run) |

---

## Per-phase tokens + wall-clock

Numbers are read from the harness usage block (`subagent_tokens`, `duration_ms`) by the
orchestrator. No agent self-reports usage.

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

*Last run:* — (not yet run)
