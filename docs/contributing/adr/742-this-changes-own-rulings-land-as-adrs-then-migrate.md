---
subjects:
  - docs/contributing/adr
  - docs/contributing/RULINGS.md
---
# 742 — This change's own rulings land as ADRs, then migrate with the corpus

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** none

## Context

The run that builds the register runs the pre-change pipeline: its decisions phase writes ADRs, and the register, its lint and the new `doctrine-lint` do not exist yet.

## Options considered

1. **ADRs 730+ through the pre-change decisions phase, migrated by the same script in the same change** *(recommended)* — pros: every commit green under its own scripts / cons: these ADRs live only until the retire commit.
2. **Direct register lines, the decisions phase overridden by hand** — cons: no lint to gate them; the pre-change `doctrine-lint` needs the ADR directory.

## Decision

**adopted-as-recommended (no user judgment)** — no trade-off: option 2 cannot be gated. A ruling settled after the ADR files are deleted is written straight into the register.

## Consequences

- None beyond the migration.
