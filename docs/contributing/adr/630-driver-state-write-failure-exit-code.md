---
subjects:
  - engine/src/driver-state-main.js
---
# 630 — A failed driver-state write exits 5 and never leaves a status behind

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

The design's exit table covers a bad env, a bad grammar, a leftover `--policy` token and an existing status, but not a filesystem write that fails part-way (disk full, permission flipped mid-call). `active` already uses exit 1 for "not driven", so an uncaught throw would collide with it.

## Options considered

1. **Distinct exit 5: remove the temp file, never write `status` after a failed write** *(recommended)* — pros: one exit code per cause; the driver never sees a status the run did not finish writing / cons: one more row in the table
2. **Rethrow, node exits 1** — cons: collides with `active`'s "not driven"

## Decision

**adopted-as-recommended (no user judgment)** — option 1. A write failure during `finished` or `blocked` removes its temp file, writes nothing further and exits 5 with the cause on stderr; the run surfaces it and finishes.

## Consequences

- The driver spec's exit-code table carries the row.
