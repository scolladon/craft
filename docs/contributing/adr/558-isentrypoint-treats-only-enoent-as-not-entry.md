---
subjects:
  - engine/src/cli-io.js
---
# 558 — `isEntryPoint` maps only `ENOENT` to "not the entry point" and rethrows every other error

- **Status:** superseded by ADR-564
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/bin-entry-symlink-guard.md · **Supersedes/Refines:** none

> **Superseded by ADR-564** for the `ENOENT` mapping: the guard no longer real-paths argv[1], so it has no filesystem
> error to map.

## Context

`realpathSync(argv1)` throws for a non-existent argv[1] (`-`, an extensionless path) and could throw `ENOTDIR` or `ELOOP`. The design calls the helper twice. A catch-all would turn a real fault back into the silent exit 0 that this fix removes.

## Options considered

1. **`ENOENT` → not entry, rethrow every other code** *(recommended)* — pros: matches `contain.js` (ADR-175) and the no-swallowed-errors guardrail; a real fault ends with a stack trace and exit 1 / cons: none observed.
2. **Catch every error → false** — cons: brings back a silent skip.

## Decision

Adopted-as-recommended (no user judgment): option 1. It follows ADR-175's realpath error handling and the guardrail against swallowed errors. The module side is never caught. The module is running, so its file exists, and any failure there is a real fault.

## Consequences

An `ENOENT` on argv[1] keeps today's behaviour: `main` is not run. Any other filesystem error is loud.
