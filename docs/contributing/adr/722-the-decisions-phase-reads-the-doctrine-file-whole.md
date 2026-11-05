---
subjects:
  - skills/decisions/SKILL.md
supersedes: []
---
# 722 — The decisions phase reads the doctrine file whole

- **Status:** accepted
- **Date:** 2026-11-05
- **Design:** docs/contributing/design/decisions-doctrine-layer.md · **Supersedes/Refines:** none

## Context

The slot-1 intention hint slices living pages by `subjects ∩ touched set`. A doctrine entry is cross-cutting and has no narrow subject.

## Options considered

1. **The phase reads the file whole** *(recommended)* — pros: no entry is sliced away / cons: the whole file enters the session each run.
2. **Join the living pages with `subjects:`** — cons: narrow subjects drop entries; `subjects: ['**']` reads stale on every diff.

## Decision

**adopted-as-recommended (no user judgment)** — ADR-351. The decisions phase reads the doctrine file whole at step 1. It is not a living page and does not enter the intention hint.

## Consequences

- File size is the cost lever; entries stay at one line per bullet.
