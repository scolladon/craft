---
subjects: []
---
# 550 — The timeout ADR refines ADR-541, it does not supersede it

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/claude-hook-timeout-probe.md · **Supersedes/Refines:** none

## Context

ADR-541 carries forward "which signal Claude Code's hook timeout sends stays unprobed". ADR-546 answers it. A `supersedes` entry would make adr-lint require ADR-541's Status to read "superseded", which is wrong: its TERM and HUP traps all stand.

## Options considered

1. **ADR-546 refines ADR-541 on its Design line; ADR-541 is not edited** *(recommended)* — matches the house "refines" form and keeps ADRs a dated ledger.
2. **`supersedes` frontmatter on ADR-541 with a scope** — cons: mislabels a standing decision.
3. **No link** — cons: a reader of ADR-541 has no pointer.

## Decision

Adopted-as-recommended (no user judgment): option 1. No `DECISION-REVERSAL` is emitted.

## Consequences

ADR-541 still reads "unprobed". The answer is found through ADR-546, which names it.
