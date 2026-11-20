---
subjects:
  - templates/design.md
  - agents/designer.md
---
# 737 — Design docs keep their Decision-candidates table

- **Status:** accepted
- **Date:** 2026-11-20
- **Design:** docs/contributing/design/doctrine-register.md · **Supersedes/Refines:** none

## Context

The spike found ADRs duplicate design docs' decision tables. With ADRs gone, the question is whether the table duplicates the register.

## Options considered

1. **Keep the table** *(recommended)* — pros: it carries alternatives, recommendation and why before a ruling exists, and is the decisions phase's input / cons: the outcome appears twice.
2. **Drop it in favour of the register** — cons: the decisions phase loses its input; `design-lint` requires the heading.

## Decision

**adopted-as-recommended (no user judgment)** — no trade-off: the register keeps only the outcome, the table is the input that produces it.

## Consequences

- None beyond today.
