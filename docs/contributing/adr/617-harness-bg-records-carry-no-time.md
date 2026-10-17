---
subjects:
  - scripts/run-ledger.sh
  - docs/contributing/specs/run-record.md
---
# 617 — `HARNESS-BG` records carry no time

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/ledger-stamps-own-timestamps.md · **Supersedes/Refines:** none

## Context

`HARNESS-BG(<phase>:<technique>): pid=<n> out=<path> spec=<path>` records a background harness run. ADR-615 makes `append` stamp time-bearing records. `HARNESS-BG` carries no time today.

## Options considered

1. **No time** *(recommended)* — pros: its only reader, the rebuild resume, checks `kill -0 <pid>` and the size of `out`, and needs no time / cons: none measured.
2. **Add `at=<iso>`, stamped by `append`** — cons: changes `HARNESS_BG_RE`, the spec row and the validation skill for a field no reader uses.

## Decision

The user ratified option 1. `append` writes `HARNESS-BG` records verbatim. `PHASE-START` stays the only stamped token.

## Consequences

- If a later reader needs the start time of a background run, it gets its own design.
