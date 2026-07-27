# 294 — Drop the bogus "#10" label on phases.required in guide §2

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/examples-catalog-gap-closure.md · **Supersedes/Refines:** refines 290

## Context

`docs/guides/customizing.md` §2 labels `phases.<id>.required` as "(Tier 0, #10)", but
under the canonical numbering (ADR 290) #10 is unambiguously the `role:` swap. The new
`phase-required/` sample makes the mislabel more visible.

## Options considered

1. **Fix it — drop the bogus `#10`, leave "(Tier 0)"** — pros: removes a factual error
   with a one-token edit / cons: none. **(designer's recommendation)**
2. **Leave §2 untouched (two-table scope only)** — pros: minimal diff / cons: ships a
   known factual error adjacent to the new sample.

## Decision

**Adopted-as-recommended (no user judgment).** The `#10` is dropped from the §2 label;
`phases.<id>.required` reads "(Tier 0)".

## Consequences

§2 no longer contradicts the canonical numbering. Number labels outside the two index
tables stay minimal — a knob is labeled by tier, numbered only when it IS a §7 point.
