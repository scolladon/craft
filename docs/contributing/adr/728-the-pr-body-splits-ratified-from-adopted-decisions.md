---
subjects:
  - templates/pr-body.md
  - skills/documentation/SKILL.md
supersedes: []
---
# 728 — The PR body splits ratified from adopted decisions, read from the ADRs

- **Status:** accepted
- **Date:** 2026-11-05
- **Design:** docs/contributing/design/decisions-doctrine-layer.md · **Supersedes/Refines:** none

## Context

Adopted choices are vetoed after the fact, so the PR must list them with their basis.

## Options considered

1. **The Decisions line splits ratified and adopted, each adopted with its basis, read from this run's ADRs** *(recommended)* — pros: the ADRs are already the durable source / cons: none measured.
2. **A new `ADOPTED(ADR-NNN):` run-record token** — cons: duplicates the ADRs in a second surface.

## Decision

**adopted-as-recommended (no user judgment)** — no trade-off. `templates/pr-body.md`'s Decisions line reads `ratified: ADR-### …; adopted: ADR-### (<basis>) …; or none`, derived from the `adopted-as-recommended` marker and its `— <basis>` suffix.

## Consequences

- No new run-record token.
