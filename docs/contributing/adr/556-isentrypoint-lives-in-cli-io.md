---
subjects:
  - engine/src/cli-io.js
  - engine/bin
---
# 556 — The bin entry-point check is one `isEntryPoint` export in `cli-io.js`

- **Status:** accepted
- **Date:** 2026-10-14
- **Design:** docs/contributing/design/bin-entry-symlink-guard.md · **Supersedes/Refines:** refines ADR-066, ADR-487

## Context

All 24 `engine/bin/*.js` repeat the same `main` guard, and it fails when the bin is reached through a symlink. The fix must land in every bin. Stryker mutates `engine/src/**` but not `engine/bin/**`, so where the check lives decides whether it is mutation-covered.

## Options considered

1. **`isEntryPoint(moduleUrl, argv1)` exported from `engine/src/cli-io.js`** *(recommended)* — pros: ADR-487 already makes `cli-io.js` the home of shared CLI predicates; it is mutated; its suite already builds symlink fixtures / cons: the module grows by one function.
2. **New `engine/src/entry-point.js` with its own suite** — pros: one concern per file / cons: a module and a suite for a single function.
3. **Inline the real-path comparison in each bin** — cons: 24 copies outside `mutate`; copy-paste is how the defect reached every bin.

## Decision

Option 1, ratified by the user. Each bin calls `isEntryPoint(import.meta.url, process.argv[1])` from `../src/cli-io.js` and keeps its own `process.exit(main(...))` dispatch (ADR-066). No bin compares `process.argv[1]` itself.

## Consequences

The guard has one implementation, and Stryker mutates it. A new bin copies the one-line call, not the comparison.
