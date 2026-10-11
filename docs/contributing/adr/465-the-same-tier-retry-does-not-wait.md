---
subjects:
  - skills/run/SKILL.md
---
# 465 — The same-tier retry does not wait

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/transient-model-retry.md · **Supersedes/Refines:** refines ADR-462

## Context

The Claude Code harness already retries a 529 with exponential backoff (at most 32 s per wait) before
the session sees the spawn fail; a foreground sleep in the orchestrator is blocked.

## Options considered

1. **No wait** *(recommended)* — pros: no moving part; the inner backoff already ran
2. **Fixed wait (~60 s)** via a background sleep or monitor — cons: extra mechanism, unproven gain

## Decision

Option 1, ratified by the user. The session respawns on the same tier immediately.

## Consequences

- If real 529s keep surviving the immediate retry, a wait can be revisited with that evidence.
