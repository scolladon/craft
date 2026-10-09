---
subjects:
  - scripts/static-lints.sh
  - test/static-lints-ci.test.js
---
# 431 — The static-lints test fails each lint position

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/ci-lint-chain-fail-closed.md · **Supersedes/Refines:** ADR-429, ADR-430

## Context

Whether the defect shows depends on which lint fails. Pinned on bash 3.2, seven of the ten positions were open and three were closed: the two loops by their inner `|| exit 1`, and the last command because it ends the list. A test that fails one representative lint can go green while another position stays open.

## Options considered

1. **One case per lint position** *(recommended)*: ten failing-position cases plus one green control that asserts all twelve invocations ran in order. Pros: a later `&&` re-join at any position turns its case red. Cons: eleven subprocess runs over stubs, a few ms each.
2. **One representative failing lint plus the green control**: pros: fewer cases. Cons: can pass while other positions stay open.

## Decision

Adopted as recommended (no user judgment). The defect is position-dependent, so only per-position coverage proves R1 for every lint. The test copies the shipped `scripts/static-lints.sh` into a mktemp throwaway and stubs every lint there. It fails each lint position in turn with a distinct status and asserts three things: the script exits with that status, no later lint ran, and with every stub green all twelve invocations ran in block order. It never runs a lint in the worktree and never names an eval path.

## Consequences

- Adding a lint to `scripts/static-lints.sh` means adding its stub and its `LINT_IDS` entry to the test, or the green control goes red.
- The test is also the bash 5.x pin: CI's ubuntu run is the first time it runs on bash 5.
