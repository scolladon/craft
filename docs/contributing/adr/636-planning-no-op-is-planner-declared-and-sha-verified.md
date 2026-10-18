---
subjects:
  - skills/planning/SKILL.md
  - agents/planner.md
  - docs/contributing/specs/run-record.md
---
# 636 — A planning no-op is declared by the planner and verified sha by sha

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/planning-no-op-outcome.md · **Supersedes/Refines:** refines ADR-103

## Context

An earlier phase can land the whole change: adr-lint C1/C3 forced a docs/ADR run's entire delta into the decisions phase's single commit, leaving planning and implementation nothing to do. `scripts/plan-lint.sh` refuses a plan with no `## Part`, and `skills/planning/SKILL.md` had no no-op outcome, so the orchestrator recorded an undocumented `NO-OP(planning)` line. Planning needs a documented signal for "no part remains" that is auditable, not asserted. ADR-103 defined `NO-OP(<phase>):` so other phases could adopt it.

## Options considered

1. **Planner declares an empty Part list** *(recommended)* — the planner returns `NO-OP: no part remains — <R1 → <sha>, …>` and the orchestrator checks every cited sha — pros: reuses the existing ≤2-respawn budget and ADR-103's justified-no-op shape; no engine change; the sha check makes the claim auditable / cons: the mapping is the planner's judgment until checked.
2. **The design's commit plan is fully landed** — pros: no planner change / cons: only 2 of 80 designs carry a `### Commit plan`, and it names commits, not deliverables, so it can drift from Requirements.
3. **Auto-skip probe** — make planning `autoSkipEligible` — cons: contradicts ADR-144 (implementation consumes `plan` with no `self_supply`), needs an engine and descriptor change plus a superseding ADR, and implementation still needs its own no-op.

## Decision

The user ratified option 1. When every design requirement is already delivered by a commit on the branch, the planner writes no plan, commits nothing, and its final message is exactly `NO-OP: no part remains — <R1 → <sha>, R2 → <sha>, …>`. Any doubt produces a plan; a partly landed requirement still gets a part. `<base>` is the default branch the workspace phase probed, resolved once with `git rev-parse --verify`; a failure escalates. Before recording, the orchestrator requires: every requirement id in the design's Requirements section mapped (an empty or partial mapping fails); each mapped value a `^[0-9a-f]{7,40}$` token that resolves to a commit, passed to git single-quoted; `git merge-base --is-ancestor <sha> HEAD` exit 0 and `git merge-base --is-ancestor <sha> <base>` exit exactly 1, any other exit escalating; no cited sha touching only the design doc or the plan directory; and a `git show --stat` spot-check that each commit delivers the requirement mapped to it. The planner maps only commits this run landed; a requirement already true before the run is planned. A failing check respawns the planner within the existing ≤2-respawn budget, then escalates `{ planning, reason, ≤3 options }`. A pass appends, in one call, the fixed idiom `NO-OP(planning): no part remains — <justification>` and `PHASE-DONE(planning): no-op — no part remains`. The idiom is greppable-only in `docs/contributing/specs/run-record.md`; `run-state` keeps consuming only the generic `NO-OP(<phase>):` prefix.

## Consequences

- Planning's procedure gains a branch ahead of plan-lint; the sizing check is skipped on it. Standalone `/craft:planning` reports the line and stops.
- A manifest `override:` of planning owns its own outcome; implementation's guard sits in its non-overridable Preamble (ADR-638).
- No engine, descriptor or `pipeline/default.yml` change.
