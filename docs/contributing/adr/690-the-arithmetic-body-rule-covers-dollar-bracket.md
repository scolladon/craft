---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 690 — The arithmetic body rule covers `$[ … ]`

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-23
- **Design:** docs/contributing/design/arith-expansion-comsub-bypass.md · **Supersedes/Refines:** none

## Context

`$[ … ]` is the older spelling of `$(( … ))` and leaks the same way when single-quoted. The other
arithmetic contexts (`(( … ))`, `for ((`, assignment subscripts, `${x:'…'}`, `${a['…']}`) leak
single-quoted substitutions too, four of five on bash 5.3 only, through different tokeniser paths.

## Options considered

1. **`$(( ))` only** — cons: leaves `$[ ]`, which shares the scanner, open
2. **`$(( ))` and `$[ ]`; file the other contexts** *(recommended)* — pros: one rule, every spelling
   of the same expansion; one descriptor
3. **Every arithmetic context** — cons: three other tokeniser paths, a separate probe set

## Decision

Ratified by the user: option 2. The other contexts are filed in the backlog.

## Consequences

`$[ … ]` gets the ADR-687 scan and the ADR-688 single-quote refusal.
