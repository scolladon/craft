---
subjects:
  - engine/src/stub-lint-main.js
---
# 476 — The exempt token is `stub-lint` alone

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/stub-lint-ci-self-reference.md · **Supersedes/Refines:** none

## Context

ADR-474 exempts the lint's own name. The family could be wider: the lint's run-record
tokens, or any `<marker>-lint` name.

## Options considered

1. **`stub-lint` only** *(recommended)* — pros: covers every finding in `ci.sh` / cons: none
2. `stub-lint` plus `STUB-WAIVE` / `STUB-FOUND` — cons: neither appears in `ci.sh`
3. Any `<marker>-lint` — cons: exempts names that do not exist (YAGNI)

## Decision

Option 1 — adopted-as-recommended (no user judgment). `STUB-WAIVE(x)` and `stub-linter`
still report `STUB`.

## Consequences

A future lint named after another marker gets its own exemption when it exists.
