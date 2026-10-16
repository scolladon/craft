---
subjects:
  - adapters/copilot/hooks/craft-guard.js
supersedes: []
---
# 585 — The copilot hook denies by JSON and crashes by exit 2

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-15
- **Design:** docs/contributing/design/copilot-git-argv-normalising-guard.md

## Context

On copilot 1.0.92 a stdout `{"permissionDecision":"deny","permissionDecisionReason":…}` denies and
shows the reason to the model; exit 2 denies but the model sees only `hook exited with code 2`. The
ext-diff deny relies on the reason so the agent re-issues with `--no-ext-diff`.

## Options considered

1. **Block → stdout JSON and exit 0; crash → exit 2 with a stderr line** *(recommended)*
2. **Exit 2 for everything** — cons: the reason never reaches the model.
3. **JSON and exit 2 together** — cons: never probed.

## Decision

Adopted-as-recommended (no user judgment): option 1, from the live evidence. The hook mirrors the
codex guard's crash contract (handlers first, dynamic import inside `try`, uncaught exception,
unhandled rejection and a drained loop all deny). An allow exits 0 with empty stdout. The audit
line stays on stderr for both verdicts.

## Consequences

A hook timeout still fails open (copilot's behaviour).
