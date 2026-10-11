---
subjects:
  - skills/run/SKILL.md
  - docs/contributing/specs/model.md
---
# 463 — The retry allowance is per spawn

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/transient-model-retry.md · **Supersedes/Refines:** refines ADR-462

## Context

A bounded retry needs a scope: a budget shared too widely brings the original problem back on a
later blip; one scoped too narrowly lets a flapping tier cost repeated dead attempts.

## Options considered

1. **Per spawn** *(recommended)* — pros: matches the practised deviation; a failed retry degrades the
   tier, so degraded-tier memory caps the waste
2. **Per tier per run** — cons: a later blip degrades the whole tier again
3. **Per phase** — cons: fan-out spawns share one retry; harder to state

## Decision

Option 1, ratified by the user. Each spawn owns one same-tier retry. A failed retry degrades the tier
for the rest of the run; a retry already in flight finishes on its tier and every spawn not yet
issued goes straight to the fallback.

## Consequences

- Worst case on a flapping tier: one extra dead attempt per in-flight spawn, then degradation.
