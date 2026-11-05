---
subjects:
  - skills/decisions/SKILL.md
  - docs/contributing/specs/run-record.md
supersedes: []
---
# 726 — A harvested entry lands in its own docs(doctrine) commit with a DOCTRINE-HARVEST line

- **Status:** accepted
- **Date:** 2026-11-05
- **Design:** docs/contributing/design/decisions-doctrine-layer.md · **Supersedes/Refines:** none

## Context

"Always draft for an against-recommendation ruling" must be auditable, declines included.

## Options considered

1. **Separate `docs(doctrine): D-<n> <title>` commit after the ADR, plus one `DOCTRINE-HARVEST(<candidate>):` line per ruling** *(recommended)* — pros: greppable doctrine history; lint is green at each commit / cons: one more commit per harvest.
2. **Doctrine edit inside the ADR commit, no token** — cons: declines leave no trace.

## Decision

**adopted-as-recommended (no user judgment)** — ADR-357. Each escalated ruling records exactly one `DOCTRINE-HARVEST(<candidate>): D-<n> added | D-<n> amended | declined — <reason> | none — covered by D-<n> | none — one-off` line. An accepted entry is committed alone as `docs(doctrine): D-<n> <title>` after its evidence ADR.

## Consequences

- The token is greppable only; `run-state` gains no row for it.
