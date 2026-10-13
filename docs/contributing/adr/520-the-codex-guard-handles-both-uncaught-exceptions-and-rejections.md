---
subjects:
  - adapters/codex/hooks/craft-guard.js
  - adapters/codex/test/craft-guard-hook.test.js
supersedes: []
---
# 520 — The codex guard handles both uncaught exceptions and rejections

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-hook-nonzero-exit-probe.md

## Context

Under node's default rejection mode an `uncaughtException` handler sees a floating rejection, but an inherited `--unhandled-rejections=warn` or `none` routes it only to `unhandledRejection`, and the guard then exits 0. `unhandledRejection` alone misses a rejected top-level await.

## Options considered

1. **`uncaughtException` and `unhandledRejection`** *(recommended)*
2. **`uncaughtException` only** — cons: exit 0 under warn/none (pinned 3/3)

## Decision

Adopted-as-recommended (no user judgment): option 1, both handlers deny with the error's message or the fail-closed reason. Aligns with the guard's fail-closed principle.

## Consequences

Whether codex passes the user's `NODE_OPTIONS` to hooks is not proven; the handler costs one line either way. A fixture spawned with `--unhandled-rejections=warn` pins it.
