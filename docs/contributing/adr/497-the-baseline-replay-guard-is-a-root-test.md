---
subjects:
  - docs/contributing/metrics-baseline.report.json
---
# 497 — The baseline replay guard is a root test

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/baseline-review-waste-replay-guard.md · **Supersedes/Refines:** none

## Context

Checks over committed files live in `test/` and run in `scripts/ci.sh`'s process suite (readme-drift, source-hygiene, architecture-boundaries). The engine suite unit-tests pure code.

## Options considered

1. **Root test `test/metrics-baseline-replay.test.js`** *(recommended)* — pros: house convention; no new wiring
2. **Engine test beside the calibration pin** — pros: precedent exists / cons: mixes a repo-state guard into a unit suite
3. **A lint bin wired into `static-lints.sh`** — pros: CLI-callable / cons: bin, main module and tests for a check with no CLI user

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** The guard is `test/metrics-baseline-replay.test.js`: it deep-compares the committed report's `recommendations` with `replayRecommendations` of itself, and two in-memory corrupted copies prove it can fail. Aligns with the house convention for guards over committed files.

## Consequences

`bash scripts/ci.sh` goes red whenever the committed recommendations disagree with the current rules.
