---
subjects:
  - adapters/codex/hooks/craft-guard.js
  - adapters/codex/test/craft-guard-hook.test.js
supersedes: []
---
# 519 — The codex guard denies when no verdict is reached

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-hook-nonzero-exit-probe.md

## Context

If the event loop drains before the guard reaches a verdict, node exits 0 — fail-open on codex 0.161.0. The designer reproduced it with a stub that destroys stdin; no trigger was found in the real code.

## Options considered

1. **Leave it** — pros: strict reading of "crash"; no proven real trigger / cons: breaks the guard's every-path-denies invariant
2. **A `beforeExit` handler that denies with the fail-closed reason** *(recommended)* — pros: reason on stderr; never emitted on an explicit `process.exit`, so the allow path is untouched / cons: guards a fixture-only trigger
3. **`process.exitCode = 2` at the top** — pros: safe against allow / cons: denies with a blank reason; adds nothing for crashes

## Decision

The user ratified option 2. The guard registers `process.on('beforeExit', …)` denying with `denied (fail-closed)`.

## Consequences

Pinned by a no-verdict fixture test; the allow path stays exit 0 because `allow()` calls `process.exit(0)`, which does not emit `beforeExit`.
