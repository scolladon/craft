---
subjects:
  - engine/src/plan-lint-main.js
---
# 367 — The plan file ceiling blocks while the overlap check keeps warning

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** refines ADR-306

## Context

Part E adds a per-part file ceiling to plan-lint, which must fail a plan that exceeds it. The
same lint already has `overlapWarnings`, which only warns when two parts declare the same
file, because the overlap check was made deliberately advisory. Shipping a blocking check
beside an advisory one on the same surface needs a stated reason.

## Options considered

1. **Ceiling blocks; overlap keeps warning** (recommended) — pros: matches acceptance; the two
   checks measure different kinds of thing / cons: one lint, two postures.
2. **Ceiling warns, consistent with the overlap posture** — cons: the warning lands on the
   orchestrator after the planner has returned and its context is gone; acting on it means
   respawning the planner anyway, which is the cost of a block without the obligation of one.
3. **Warn now, block later** — cons: the lint has no configuration surface to hold the mode.

## Decision

The file ceiling exits non-zero. The overlap check keeps warning.

The asymmetry follows from what each check measures. Overlap is a property of a **pair** of
parts, and the advisory posture exists because overlap is sometimes correct — this repo has
shipped a plan where two parts deliberately edited the same file. Over-ceiling is a property
of **one** part, and it is exactly what the planner was instructed not to produce; there is no
case where it is correct and the planner could not have split it.

## Consequences

- A plan that breaches the ceiling cannot reach the implementation phase; the planner is
  respawned with the rule restated.
- The ceiling value must be configurable, or a repo with genuinely large parts has no recourse
  but to fork the lint.
- The two postures must be explained where the lint is documented, or the inconsistency reads
  as an oversight.
