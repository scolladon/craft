---
subjects:
  - contracts/construction.md
  - evals/implementer-guard-outside-part/**
---
# 441 — One out-of-part edit triggers the contract fix

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/arriving-guard-part-bound.md · **Supersedes/Refines:** none

## Context

The backlog entry asks for proof before the arriving-`GUARD` clause is bounded to the part. The threshold for that proof decides whether the contract changes.

## Options considered

1. **Any with-craft run classed E (edited the out-of-part file) on hand read, at any tier** *(recommended)* — pros: one edit of a file the plan forbids is the proof the entry asks for / cons: a single run can be an outlier
2. **E in at least 2 of 3 runs at one tier** — pros: filters noise / cons: treats a real violation as noise
3. **E or B (blocked)** — pros: counts the literal "not a blocker" loss / cons: counts a safe outcome one candidate fix prescribes

## Decision

Adopted-as-recommended (no user judgment): option 1, as the maintainer's brief states ("only if a run shows the conflict"). With no E run at any tier, the entry closes as not reproduced, with the classification counts.

## Consequences

- An E run opens the contract-fix design, with this case as its before/after measure; B, D and S runs are recorded either way.
