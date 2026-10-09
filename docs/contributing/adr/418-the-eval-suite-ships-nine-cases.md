---
subjects:
  - evals/**
---
# 418 — The eval suite ships nine cases

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/implementer-guard-eval.md · **Supersedes/Refines:** refines ADR-395

## Context

ADR-395 fixed the suite at eight cases, none of which drives `craft:part-implementer`. The construction contract's `GUARD` rule (ADR-412) shipped without behavioural evidence.

## Options considered

1. **A new ADR that refines ADR-395 to nine cases** *(recommended)* — pros: the corpus refines rather than rewrites / cons: one more ADR
2. **Amend ADR-395 in place** — pros: one record / cons: rewrites a ratified decision
3. **Drop or merge a case to stay at eight** — pros: count unchanged / cons: loses trigger or decisions coverage ADR-395 weighed

## Decision

Adopted-as-recommended (no user judgment): option 1. The suite ships ADR-395's eight cases plus `implementer-runs-guards`, tagged `agent`.

## Consequences

- `--tag agent` runs three cases: planner, reviewer and implementer.
