---
subjects:
  - test/helpers/ambient-env.js
---
# 488 — The ambient-env test helper is shared, not copied

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/backlog-sweep-six-entries.md · **Supersedes/Refines:** none

## Context

A second suite needs `withAmbientEnv`, which sets ambient variables for one callback and
restores them from saved values, deleting only keys that were absent before.

## Options considered

1. **Extract to `test/helpers/ambient-env.js` with its own suite** *(recommended)* — pros: the restore logic lives once / cons: one more helper and suite
2. Copy it into the second suite — cons: two copies of restore logic drift

## Decision

Option 1 — **adopted-as-recommended (no user judgment)**: it follows the DRY principle the
same change applies to the lint predicates.

## Consequences

Suites that plant ambient env go through the shared helper.
