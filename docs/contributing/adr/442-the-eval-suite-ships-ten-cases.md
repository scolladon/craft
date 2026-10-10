---
subjects:
  - evals/**
---
# 442 — The eval suite ships ten cases

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/arriving-guard-part-bound.md · **Supersedes/Refines:** refines ADR-418

## Context

ADR-418 fixed the suite at nine cases. None of them puts a failing `GUARD`'s GREEN in a file another part owns, so the conflict between the arriving-`GUARD` clause and the Scope line has no behavioural evidence.

## Options considered

1. **A new ADR that refines ADR-418 to ten cases** *(recommended)* — pros: the corpus refines rather than rewrites, as ADR-418 did for ADR-395 / cons: one more ADR
2. **Amend ADR-418 in place** — pros: one record / cons: rewrites a ratified decision
3. **Extend `implementer-runs-guards` with a second part** — pros: count unchanged / cons: changes the baseline that case's before/after record measures

## Decision

Adopted-as-recommended (no user judgment): option 1. The suite ships ADR-418's nine cases plus `implementer-guard-outside-part`, tagged `agent`.

## Consequences

- `--tag agent` runs four cases: planner, reviewer and the two implementer cases.
