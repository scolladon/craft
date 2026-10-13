---
subjects:
  - docs/contributing/specs/cursor-poc-record.md
---
# 545 — The cursor hook shell's node version is recorded, not acted on

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/cursor-hook-nonzero-exit-probe.md · **Supersedes/Refines:** none

## Context

The live probe's stack trace showed that `node` inside Cursor's hook shell resolved to v24.5.0 on the probe host, while the operator shell and CI run v22.22.3.

## Options considered

1. **Out of scope, not recorded** — cons: drops a measured fact
2. **Recorded in the POC record's re-probe Hook shell row, no action** *(recommended)*
3. **Option 2 plus a BACKLOG entry to pin which `node` the hook shell resolves** — cons: opens work on an unproven problem; the guard ran and was blocked as designed

## Decision

Adopted-as-recommended (no user judgment): option 2, marked host-specific.

## Consequences

No code, test or BACKLOG change follows from it.
