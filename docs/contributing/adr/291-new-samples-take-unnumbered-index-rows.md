# 291 — New port/knob samples take un-numbered index rows

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** docs/contributing/design/examples-catalog-gap-closure.md · **Supersedes/Refines:** refines 290

## Context

Six new samples (policy, intention, memory ports; `phases.<id>.required`, `hygiene.gate`,
`pipeline.reorder`) must land in both indexes, but none of them is a PRD §7 injection
point, so assigning them #14–#19 would overload the PRD-anchored numbering.

## Options considered

1. **Un-numbered `—` rows in §4 and README** — pros: matches how existing port/tracker/
   default-off/named-config rows already appear; keeps #1–#13 stable / cons: un-numbered
   rows are not referenceable by number. **(designer's recommendation)**
2. **New sequential numbers #14–#19** — pros: every row referenceable / cons: numbers no
   longer map to PRD §7 points; future PRD additions collide.
3. **Number only the two spine knobs** — pros: partial referenceability / cons: an
   inconsistent hybrid with no principle behind the split.

## Decision

**Adopted-as-recommended (no user judgment).** The six new samples take un-numbered `—`
rows in both the §4 index and the README "By injection point" table, matching the
existing convention for non-§7 rows. The #1–#13 PRD numbering stays stable.

## Consequences

Index numbering remains a strict PRD §7 mapping. Any future non-§7 sample follows the
same un-numbered form.
