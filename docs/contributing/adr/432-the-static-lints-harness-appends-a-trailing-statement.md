---
subjects:
  - test/static-lints-ci.test.js
---
# 432 — The static-lints harness appends a trailing statement

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/ci-lint-chain-fail-closed.md · **Supersedes/Refines:** refines ADR-431

## Context

Measured during planning: when the `&&` list is the last statement of its own script, a failure that short-circuits it becomes the script's exit status. So a verbatim move into `scripts/static-lints.sh` already exits non-zero for 7 of the 10 positions the design pinned as fail-open. Those positions leak only when more statements follow, which is what `ci.sh` had. A harness that runs the copied script unchanged turns only 2 of 10 cases red against the verbatim move, so it cannot reproduce the defect.

## Options considered

1. **Copy the shipped script and append one `true` line** *(recommended)*: pros: restores the "statements follow" condition. Against the verbatim move, 9 of 10 cases are red (measured). It also catches a re-join of the last two lines. Cons: the throwaway script is the shipped bytes plus one line.
2. **Byte-for-byte copy**: pros: runs exactly the shipped file. Cons: 2 of 10 cases are red, and only the design's pinned matrix shows the other 7 positions.
3. **Both harnesses**: pros: none over option 1. Cons: 21 cases for the same coverage.

## Decision

The maintainer chose option 1. The behavioural test copies the shipped `scripts/static-lints.sh` into the throwaway and appends one trailing statement (`true`) before it runs. Every per-position and control assertion in ADR-431 stands unchanged.

## Consequences

- The harness proves each lint stops the script whatever follows it, not only when the lint ends the file.
- The wiring assertion that `ci.sh` calls the script as a bare statement is still needed. The harness says nothing about the call site.
