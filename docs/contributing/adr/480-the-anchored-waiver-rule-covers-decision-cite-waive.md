---
subjects:
  - engine/src/hygiene-lint-core.js
---
# 480 — The anchored waiver rule covers DECISION-CITE-WAIVE too

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/waiver-mention-not-waiver.md · **Supersedes/Refines:** refines ADR-357

## Context

`adr-lint` collects `DECISION-CITE-WAIVE` through the same `collectWaived` call, from every
tracked design and plan doc plus touched `.md`. A prose mention flipped its exit from 2 to 0,
so it shares the fail-open, with a wider waiver-source corpus than the hygiene gates.

## Options considered

1. **Include adr-lint** *(recommended)* — pros: no extra production code; the shared core fixes all three gates / cons: one more pin test
2. STUB/SLOP only — cons: needs a per-gate opt-in flag on `collectWaived` and leaves the adr-lint fail-open

## Decision

Option 1 — ratified by the user. The anchored rule applies to every gate that calls
`collectWaived`: `STUB-WAIVE`, `SLOP-WAIVE` and `DECISION-CITE-WAIVE`. `INTENTION-WAIVE` is
read in-session by the validation skill, not by `collectWaived`, and is out of scope.

## Consequences

Refines ADR-357's consequence "no change to `collectWaived`": the token and its call site are
unchanged, but the collection rule it relies on now requires the anchored shape.
