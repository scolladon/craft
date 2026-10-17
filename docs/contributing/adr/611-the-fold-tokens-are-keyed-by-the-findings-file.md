---
subjects:
  - docs/contributing/specs/run-record.md
supersedes: []
---
# 611 — The fold tokens are keyed by the finding's file

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/fold-in-scope-followups.md · **Supersedes/Refines:** refines ADR-610

## Context

A `TOKEN(<param>):` line is read by grep and recall, so the parameter must hold no `)` or `:`. Of 103 bold backlog titles, 8 hold parentheses and 10 a colon, and some entries have no bold title.

## Options considered

1. **The entry's bold title** — cons: breaks the token form for about one title in six.
2. **The finding's repo-relative locus file, the title in the payload** *(recommended)* — pros: no delimiter clash, `FOLDED` and `FILED` share one key / cons: a multi-file finding needs one line per file.
3. **A slug derived from the title** — cons: a slug rule no other token has.

## Decision

Option 2. The parameter is the repo-relative path of the finding's locus file; a multi-file fold writes one line per file.

## Consequences

The ledger's assumption of whitespace-free repo-relative paths covers the parameter.
