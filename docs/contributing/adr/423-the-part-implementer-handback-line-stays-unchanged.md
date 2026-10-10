---
subjects:
  - agents/part-implementer.md
---
# 423 — The part-implementer handback line stays unchanged

- **Status:** superseded by ADR-434
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/arriving-guard-contract-rule.md · **Supersedes/Refines:** none

> **Superseded by ADR-434** for the part-implementer handback line staying unchanged: the line now
> names a `GUARD` that failed on its first run with a `PLAN-MISMATCH` token.

## Context

ADR-421 tells the implementer to report a `GUARD` that failed on its first run as a RED/GREEN cycle with a deferred observation. The handback line of `agents/part-implementer.md` already asks for one line per RED/GREEN cycle and per `GUARD`, plus any deferred observations.

## Options considered

1. **Leave the handback line unchanged** *(recommended)* — pros: the slots the new clause names already exist; no mirror regeneration / cons: none measured
2. **Append how a `GUARD` that failed on its first run is reported** — pros: explicit at the handback / cons: duplicates the contract; regenerates six mirrors for no measured gap

## Decision

Adopted-as-recommended (no user judgment): option 1. `agents/part-implementer.md` and its adapter mirrors do not change.

## Consequences

- Haiku's measured `GUARD`-labelled fix is addressed by the contract text alone; the sweep shows whether that suffices.
