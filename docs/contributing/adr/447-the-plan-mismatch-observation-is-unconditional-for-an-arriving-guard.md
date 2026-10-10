---
subjects:
  - agents/part-implementer.md
---
# 447 — The PLAN-MISMATCH observation is unconditional for an arriving GUARD

- **Status:** rejected — reverted after measurement
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/arriving-guard-part-bound.md · **Supersedes/Refines:** refines ADR-444

## Context

ADR-444's bullet tied the `PLAN-MISMATCH` observation to the in-part branch ("whose GREEN lies inside the part gets a RED/GREEN line and the deferred observation …"). After it shipped, `implementer-runs-guards` at haiku omitted the observation in 2 of 7 runs, against 0 of 4 before; both runs wrote the in-part GREEN. That case's plan never says who owns `greet.sh`, so the condition leaves haiku to judge ownership before it reports the mismatch. Sonnet and opus held at 1.00; `implementer-guard-outside-part` stayed 12 of 12 blocked at every tier.

## Options considered

1. **Make the observation unconditional for every `GUARD` that failed on its first run; the inside/outside condition only picks the RED/GREEN line or the blocker** *(recommended)* — pros: the mismatch report no longer waits on an ownership judgment / cons: haiku re-measured on both cases
2. **Keep ADR-444's bullet and record the omission as a follow-up** — pros: no further change / cons: ships below the acceptance bar
3. **Run more haiku sweeps first** — pros: tighter estimate / cons: no change to the cause

## Decision

The maintainer chose option 1. The bullet's sentence reads: A `GUARD` that failed on its first run always gets the deferred observation `PLAN-MISMATCH(<test title>): the plan expected it to pass; it failed on its first run`: with a RED/GREEN line when its GREEN lies inside the part, or as the reason of a blocker when its GREEN lies outside it.

## Consequences

- The structure pin moves to the new clauses; the `PLAN-MISMATCH(<test title>):` prefix pin is unchanged.
- Haiku is re-measured on both implementer cases against the ADR-446 acceptance read.
- Measured and reverted the same day. With this bullet, haiku omitted the observation in 3 of 4 `implementer-runs-guards` runs, and `implementer-guard-outside-part` went from 4 of 4 blocked to one run that edited `lib/name.sh`, two that deferred, and one that dropped the check while reporting it unchanged. ADR-444's bullet stands; the 2-of-7 omission stays open.
