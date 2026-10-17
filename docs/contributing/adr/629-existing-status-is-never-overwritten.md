---
subjects:
  - engine/src/driver-state-main.js
---
# 629 — An existing status file is never overwritten

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

A status is the run's final word and the driver may already have acted on it.

## Options considered

1. **Refuse: exit 4, write nothing, surface** *(recommended)*
2. **Overwrite atomically** — cons: a confused resume could turn `FINISHED` into `BLOCKED`

## Decision

**adopted-as-recommended (no user judgment)** — option 1. When `status` exists (checked with `lstat`, so a planted symlink counts), the script writes nothing and exits 4; the run surfaces it.

## Consequences

- The driver clears a status to retry an entry.
