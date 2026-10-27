---
subjects:
  - hooks/progress/register.tsx
  - hooks/progress/bind.ts
---
# 711 — Run progress refreshes on host events, gated by the ledger's mtime and size

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-27
- **Design:** docs/contributing/design/run-visibility-task-list.md · **Supersedes/Refines:** none

## Context

Every ledger write is an orchestrator Bash call. The view must follow the ledger without costing anything in sessions where no craft run is live.

## Options considered

1. **Event-driven: main-loop Bash PostToolUse, turn start/complete, session start/compact, re-projecting only when one runs-dir listing shows the ledger's `(mtimeMs, size)` changed** *(recommended)* — pros: idle costs nothing; reads the ledger itself / cons: one listing per trigger while bound
2. **Timer poll with the same gate** — cons: a timer in every session where craft is installed
3. **PostToolUse only when the command text names `run-ledger.sh`** — cons: correctness depends on command spelling

## Decision

Option 1.

## Consequences

A reworded skill cannot freeze the view. No timer runs.
