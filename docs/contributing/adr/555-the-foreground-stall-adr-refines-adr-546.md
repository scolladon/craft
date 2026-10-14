---
subjects: []
---
# 555 — The foreground-stall ADR refines ADR-546, it does not supersede it

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/claude-hook-foreground-stall-probe.md · **Supersedes/Refines:** none

## Context

ADR-546 stands whole: the timeout is documented, not fixed, and the traps stay. ADR-551 extends its evidence to a foreground stall. A `supersedes` entry would make adr-lint require ADR-546's Status to read "superseded", which is wrong.

## Options considered

1. **ADR-551 refines ADR-546 on its Design line; ADRs 541 and 546 are not edited** *(recommended)* — the form ADR-550 chose for ADR-546 and ADR-541.
2. **`supersedes` frontmatter on ADR-546 with a scope** — cons: edits a dated ADR and mislabels a standing decision.
3. **No link** — cons: a reader of ADR-546 has no pointer to the foreground answer.

## Decision

Adopted-as-recommended (no user judgment): option 1, aligned with ADR-550. No `DECISION-REVERSAL` is emitted. ADR-541 needs no link: its foreground-deferral consequence still holds for a sender that signals the hook pid only.

## Consequences

ADR-546 keeps its wording. The foreground answer is found through ADR-551, which names it.
