---
subjects:
  - agents/part-implementer.md
---
# 435 — The handback's `GUARD` slot covers a `GUARD` that passed on its first run

- **Status:** accepted
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/haiku-arriving-guard-handback.md · **Supersedes/Refines:** refines ADR-434

## Context

The handback line asks for one line "per `GUARD`" with no condition. Two of the three haiku sweep runs of `implementer-runs-guards` used that slot to report a `GUARD` that failed on its first run as a `GUARD`, against the contract's "report a RED/GREEN cycle" (ADR-421). Left open, the slot contradicts the ADR-434 sentence that follows it.

## Options considered

1. **Leave "per `GUARD`" open** — pros: no extra words / cons: the line asks for a `GUARD` line and a RED/GREEN line for the same test
2. **Scope it to "per `GUARD` that passed on its first run"** *(recommended)* — pros: uses the contract's own pass/fail split / cons: six more words

## Decision

Adopted-as-recommended (no user judgment): option 2, aligned with ADR-421's split of a `GUARD` by its first run. The handback's `GUARD` slot reads "per `GUARD` that passed on its first run".

## Consequences

- No grader reads the label; the paid sweep's hand read records whether the step-1 test is labelled RED/GREEN.
