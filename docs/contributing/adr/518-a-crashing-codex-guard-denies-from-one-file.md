---
subjects:
  - adapters/codex/hooks/craft-guard.js
  - adapters/codex/test/craft-guard-hook.test.js
supersedes: []
---
# 518 — A crashing codex guard denies from one file

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-hook-nonzero-exit-probe.md

## Context

codex-cli 0.161.0 runs a PreToolUse tool call on every hook exit status except 2, and on signal death (offline fake-provider probe, see the design's Context). The guard's static imports are linked before `main()`'s `try`, so a dependency that fails to resolve, parse or evaluate exits 1; a throw from the stdin `data` callback (a `RangeError: Invalid string length` on oversized input) also escapes the `try` and exits 1. Both fail open.

## Options considered

1. **Dynamic imports inside the `try` only** — pros: smallest change / cons: the stdin-callback throw still exits 1
2. **Zero-import entry plus a new body module** — pros: same coverage / cons: a second module, and `denyWith` duplicated or moved to a third module the entry must import statically
3. **One file: process crash handlers registered at the top, dependencies dynamically imported inside the `try`** *(recommended)*

## Decision

Adopted-as-recommended (no user judgment): option 3. `hooks/craft-guard.js` keeps no static import; it registers its crash handlers before any dependency loads and imports `../src/craft-root.js` and `../src/git-guard-adapter.js` with `await import()` inside `main()`'s `try`. Every crash reaches the same deny call: stderr reason, exit 2. Aligns with the guard's fail-closed principle (ADR-255: exit 2 is the only deny route) and keeps the registered command and file path the trust matcher names (ADR-517) unchanged.

## Consequences

A failure before node runs the guard body remains fail-open and cannot be fixed in-guard: `node` missing from `PATH`, `craft-guard.js` itself missing or unparseable, signal death, a throwing `NODE_OPTIONS` preload. The README states this residual.
