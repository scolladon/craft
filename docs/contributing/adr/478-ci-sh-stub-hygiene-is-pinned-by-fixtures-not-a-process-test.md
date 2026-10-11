---
subjects:
  - engine/test/stub-lint-main.test.js
---
# 478 — ci.sh stub hygiene is pinned by fixtures, not a process test

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/stub-lint-ci-self-reference.md · **Supersedes/Refines:** none

## Context

The fix could be guarded by unit fixtures shaped like `ci.sh` lines, or by a process test
running the lint over the real `scripts/ci.sh` and asserting no findings.

## Options considered

1. **Fixture-only unit tests** *(recommended)* — pros: keeps the ADR-212 advisory default / cons: the real file is not asserted
2. Fixtures plus a process test over the real `ci.sh` — cons: makes any marker in `ci.sh` a hard failure regardless of `hygiene.gate`

## Decision

Option 1 — adopted-as-recommended (no user judgment).

## Consequences

`ci.sh` stays under the advisory `hygiene.gate` like every other touched file.
