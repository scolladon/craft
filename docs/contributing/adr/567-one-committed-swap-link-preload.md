---
subjects:
  - engine/test-helpers/swap-link-on-load.js
---
# 567 — One committed preload swaps the link for both race suites

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/entry-guard-symlink-swap-race.md · **Supersedes/Refines:** none

## Context

The race needs a module load hook that repoints or unlinks argv[1]'s link while a dependency loads. `module.register` prints a deprecation warning on Node 26.11.1; `module.registerHooks` reproduces the race silently on every supported Node.

## Options considered

1. **One preload `engine/test-helpers/swap-link-on-load.js`, `registerHooks`-based, configured by env vars, passed with `--import` by absolute path** *(recommended)* — pros: one hook; `test-helpers/` is already outside stub-lint.
2. **Each suite writes the hook into its sandbox** — cons: two copies of the hook.

## Decision

Adopted-as-recommended (no user judgment): option 1, following DRY. The codex suite reaches it by path, as `trust-hook` already reaches `engine/`.

## Consequences

The hook is test-only code shared across the engine and codex suites.
