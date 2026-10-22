---
subjects:
  - adapters/codex/README.md
  - adapters/README.md
supersedes: []
---
# 675 — Codex skill-loading claims carry no bare skill count

- **Status:** accepted
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-reprobe.md · **Supersedes/Refines:** none

## Context

The current-state lines in `adapters/codex/README.md` and `adapters/README.md` say "19 shared
skills". Adding `skills/lessons` made that 20, and no gate noticed.

## Options considered

1. **Count-free claim plus one dated measurement** *(recommended)* — "none load without the
   symlinks, all load with them", pinned once as "0 of 20 versus 20 of 20 on 0.163.0"
   / cons: the reader sees the count only in the dated clause
2. **Write 20** — pros: minimal / cons: stale again on the next added skill

## Decision

The user chose option 1. Dated measurements in the record and BACKLOG keep the count they were
measured against (19 for 0.145.0 and 0.162.1).

## Consequences

A new shared skill leaves the current-state claim true; only a re-probe adds a new dated count.
