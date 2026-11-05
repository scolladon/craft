---
subjects:
  - skills/decisions/SKILL.md
supersedes: []
---
# 725 — A ruling that matches the recommendation is harvested only when uncovered and general

- **Status:** accepted
- **Date:** 2026-11-05
- **Design:** docs/contributing/design/decisions-doctrine-layer.md · **Supersedes/Refines:** none

## Context

The harvest step turns rulings into doctrine. Rulings against the recommendation or against an entry are always drafted; the open choice is rulings that match it.

## Options considered

1. **Draft only when no entry covers it and the rationale reaches beyond the candidate** *(recommended)* — pros: few extra questions / cons: "reaches beyond" is a session judgment.
2. **Draft for every ruling** — cons: every escalation becomes two questions.
3. **Never** — cons: misses a principle the user states while agreeing.

## Decision

**adopted-as-recommended (no user judgment)** — the brief's goal of asking rarely. A matching ruling is drafted only when no doctrine entry covers its rationale and that rationale applies beyond the candidate. A ruling against the recommendation or against an entry is always drafted.

## Consequences

- Declines are recorded, so a skipped draft is visible.
