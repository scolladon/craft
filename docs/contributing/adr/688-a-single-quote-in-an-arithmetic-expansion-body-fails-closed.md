---
subjects:
  - engine/src/guards/shell-tokeniser.js
supersedes: []
---
# 688 — A single quote in an arithmetic expansion body fails closed

- **Status:** accepted
- **Date:** 2026-10-23
- **Design:** docs/contributing/design/arith-expansion-comsub-bypass.md · **Supersedes/Refines:** refines ADR-594

## Context

Inside `$(( … ))` bash does not treat `'` as quoting: `$(( '$(git push -f origin)' ))` runs git on
3.2.57 and 5.3.20, then fails with an arithmetic syntax error. A `'` there is never valid
arithmetic on either shell.

## Options considered

1. **Fail closed with a new `ARITHMETIC_SINGLE_QUOTE` reason** *(recommended)* — pros: blocks no
   working command; follows ADR-594 (an unmodelled construct is unparseable)
2. **Treat `'…'` as a span that hides `)` but is still scanned** — cons: a second quoting mode in
   the scanner, for commands that always fail

## Decision

Adopted-as-recommended (no user judgment): option 1, aligned with ADR-594.

## Consequences

Every Bash call holding a `'` inside an arithmetic expansion body is denied; none of them run
successfully in bash.
