---
subjects:
  - evals/implementer-guard-outside-part/**
  - contracts/construction.md
---
# 446 — The scope fix is accepted on no edited, altered or silent run

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/arriving-guard-part-bound.md · **Supersedes/Refines:** none

## Context

The after-measure re-runs `implementer-guard-outside-part` per agent tier against ADR-443's sentence. The acceptance read decides whether the fix holds.

## Options considered

1. **No E (edited) and no T (altered check) run at any tier** — pros: matches the two measured failures / cons: lets a silently dropped check (S) pass
2. **No E, T or S run at any tier; D (deferred, file untouched) is recorded as a wording gap** *(recommended)* — pros: S drops the check the new sentence says to leave unchanged / cons: none measured
3. **Every with-craft run is B (blocked)** — pros: matches the new sentence literally / cons: fails a D run that scores 1.00 under ADR-439

## Decision

Adopted-as-recommended (no user judgment): option 2. Under every option, `implementer-runs-guards` stays at 1.00 with craft at every tier.

## Consequences

- An E, T or S run after the fix reopens the contract wording before the backlog entry closes.
