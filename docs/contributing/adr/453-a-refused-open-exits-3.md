---
subjects:
  - scripts/run-ledger.sh
  - skills/run/SKILL.md
---
# 453 — A refused open exits 3

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/refuse-open-on-live-run-id.md · **Supersedes/Refines:** none

## Context

The orchestrator must branch on a refused `open` alone (STOP and ask), distinct from runtime failures. `run-ledger.sh` exits 1 for runtime failures such as "not inside a git repository's work tree" and 2 for usage errors.

## Options considered

1. **3, a dedicated code** *(recommended)* — pros: the skill branches on refusal alone; matches `worktree-teardown.sh`'s REFUSED code for live state / cons: one more code to document
2. **1, the generic `die` default** — pros: no new constant / cons: indistinguishable from other runtime failures

## Decision

Option 1, ratified by the user.

## Consequences

- A refusal prints nothing to stdout, so no run-key reaches the transcript and no compaction hook binds to the refused attempt.
