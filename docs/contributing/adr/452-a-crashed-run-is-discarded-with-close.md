---
subjects:
  - scripts/run-ledger.sh
  - skills/run/SKILL.md
---
# 452 — A crashed run is discarded with close

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/refuse-open-on-live-run-id.md · **Supersedes/Refines:** none

## Context

With `open` refusing an open run-id (ADR-450), a crashed run that never reached `close` needs a discard path.

## Options considered

1. **The existing `close <run-id>`, then the unchanged §0 step-4 call** *(recommended)* — pros: no new grammar; `open` keeps rejecting extra arguments; `close` already means "end this run" / cons: two calls instead of one
2. **A new `open <run-id> --force`** — pros: one call, teardown precedent / cons: new grammar; a flag on `open` is one step from an orchestrator auto-retry
3. **Both** — cons: two surfaces for one act

## Decision

Option 1, ratified by the user. The orchestrator never runs `close` on a refused run-id without the user choosing to discard it.

## Consequences

- `open demo --in-place` still exits 2 and creates nothing.
- The refusal message carries no `close` hint, so a model reading stderr is not steered into discarding.
