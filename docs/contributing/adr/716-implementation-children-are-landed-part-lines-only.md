---
subjects:
  - engine/src/run-progress.js
---
# 716 — Implementation children are landed PART lines only

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-27
- **Design:** docs/contributing/design/run-visibility-task-list.md · **Supersedes/Refines:** none

## Context

Plan parts nest under `implementation`. The ledger names the plan's location only in free-text outcomes.

## Options considered

1. **Landed `PART` lines only** *(recommended)* — pros: ledger-only; no worktree path
2. **Read the plan doc** — cons: guesses a path
3. **A seeded `PLAN: <n>` token** — cons: a second format change for a cosmetic `k/n`

## Decision

Option 1. Aligns with the brief's no-format-change default.

## Consequences

Pending parts are not listed before they land.
