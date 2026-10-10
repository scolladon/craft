---
subjects:
  - contracts/construction.md
  - engine/test/contract-equivalence.test.js
---
# 445 — The construction pins cover both arriving-GUARD outcomes

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/arriving-guard-part-bound.md · **Supersedes/Refines:** refines ADR-424

## Context

ADR-424 pins the construction contract's `GUARD` clauses as phrases. ADR-443's sentence breaks the pin `fails on its first run is a RED: write its GREEN` and adds an out-of-part outcome no pin covers.

## Options considered

1. **Replace the stale pin with `fails on its first run is a RED: when its GREEN lies inside the part, write it`, keep `not a blocker`, add `When its GREEN lies outside the part, it is a blocker` and `leave that file and the GUARD's check unchanged`** *(recommended)* — pros: each pin covers a clause a paid run measured, the check clause included / cons: four construction markers for one sentence pair
2. **Pin only the two clause heads** — pros: fewer markers / cons: leaves the check clause, which answers the altered-check run, to the paid sweep alone
3. **One marker per full sentence** — pros: strictest / cons: fails CI on any wording polish

## Decision

Adopted-as-recommended (no user judgment): option 1, in ADR-424's phrase-pin style.

## Consequences

- The new markers land first and fail against the shipped contract, then ADR-443's sentence greens them.
