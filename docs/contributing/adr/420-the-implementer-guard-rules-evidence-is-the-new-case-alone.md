---
subjects: []
---
# 420 — The implementer GUARD rule's evidence is the new case alone

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/implementer-guard-eval.md · **Supersedes/Refines:** none

## Context

The case measures the rule on today's tree. A run on the tree before the `GUARD` clause would show whether the clause changes behaviour, at the cost of an extra paid run outside the brief.

## Options considered

1. **The new case only: pilot, replay, per-tier sweep** *(recommended)* — pros: the brief's scope / cons: no before/after contrast
2. **Also one sonnet run on the tree before the clause** — pros: before/after contrast / cons: extra paid run the brief does not ask for
3. **The pilot only** — pros: cheapest / cons: one tier, one run

## Decision

Adopted-as-recommended (no user judgment): option 1.

## Consequences

- Whether the clause itself changes implementer behaviour stays unmeasured.
