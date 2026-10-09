---
subjects:
  - docs/contributing/maintainer-smokes.md
---
# 428 — The escalates-fork before baseline is the 2026-10-06 pilot

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/harder-decisions-fork-fixture.md · **Supersedes/Refines:** none

## Context

The before → after record needs a before. The 2026-10-06 suite pilot ran the unedited case once per arm: with-craft 1.00 / bare 1.00 / Δ 0.00.

## Options considered

1. **The 2026-10-06 1-run numbers** *(recommended)* — pros: no paid run on a fixture being retired / cons: before (n=1) and after (n=3) differ in run count
2. **Also a 3-run on the unedited fixture** — pros: equal n; tests whether the sentence caused the bare pass / cons: a second paid sweep on a retired fixture

## Decision

**adopted-as-recommended (no user judgment)** — the brief asks for before → after with no before re-run. Option 1.

## Consequences

- The record states the before's run count next to its numbers.
