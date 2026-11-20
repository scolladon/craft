---
subjects:
  - engine/src/rulings-migrate-main.js
  - engine/bin/rulings-migrate.js
---
# 741 — Migration refuses until every suspect chosen option is tabled

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** none

## Context

A migrated line's refused list depends on which option the ADR chose. The spike's 11-entry table of against-recommendation rulings misses at least 133, 538, 655 and 674, and no single text rule reads the chosen option reliably.

## Options considered

1. **`--chosen` table, then the adopted marker, then the recommended marker; the script refuses while any suspect ratified ADR lacks a table entry** *(recommended)* — pros: never writes the chosen option as refused / cons: about a dozen paragraphs read by hand once.
2. **Refused lists only on adopted ADRs and table entries** — cons: drops the refused memory from about 430 ratified lines.
3. **Recommended marker plus the 11-entry table** — cons: wrong refused lists on the missed rulings.

## Decision

**adopted-as-recommended (no user judgment)** — DOCTRINE(D-1). Option 1: an input the script cannot map is refused, not guessed.

## Consequences

- The table is committed with the generated register and deleted with the ADR files.
