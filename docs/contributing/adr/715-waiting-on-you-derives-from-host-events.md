---
subjects:
  - hooks/progress/bind.ts
---
# 715 — "Waiting on you" derives from host events

- **Status:** accepted
- **Date:** 2026-10-27
- **Design:** docs/contributing/design/run-visibility-task-list.md · **Supersedes/Refines:** none

## Context

Users ask whether a run is waiting for them. The ledger records an ask only after its answer, so it cannot say so.

## Options considered

1. **Host events: an open `AskUserQuestion`, or a main-loop turn end with the run open, shows "waiting on you — <phase>"; a live `HARNESS-BG` pid shows "waiting on background"** *(recommended)* — pros: no ledger change / cons: host-specific
2. **An `ASK`/`ANSWERED` token pair** — cons: orchestrator tool calls at every ask; fails open when forgotten
3. **No distinct status** — cons: leaves the question unanswered

## Decision

Option 1, ratified by the user.

## Consequences

Attention is host state held in the mod, never written to the ledger.
