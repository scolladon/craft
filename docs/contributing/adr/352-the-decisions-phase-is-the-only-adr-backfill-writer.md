---
subjects:
  - skills/decisions/SKILL.md
---
# 352 — The `decisions` phase is the only ADR backfill writer

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

The governance declaration is absent from all 350 legacy ADRs and backfill is lazy. Something
has to decide which run writes the block into a pre-existing ADR.

## Options considered

1. **The `decisions` phase only**, for ADRs it authors or supersedes — pros: the write already
   routes through the intention port's `record` / cons: the lane grows only when `decisions`
   runs. *(designer's recommendation)*
2. **Any phase that reads an ADR backfills it** — pros: fastest adoption / cons: makes a read
   phase a writer.
3. **No automatic backfill** — pros: honest / cons: leaves the governing lane empty for as long
   as authors forget.

## Decision

**adopted-as-recommended (no user judgment).** Option 1. Every ADR write stays behind the one
verb that already owns them, so the backfill inherits `record`'s blocker semantics and its
byte-for-byte file-adapter routing.

## Consequences

The designer contract stays read-then-design; a design-phase commit never touches ADRs, so the
artifact-handoff boundary is unmuddied. The governing lane starts empty and grows by use — the
same adoption curve `subjects:` already has on living pages.
