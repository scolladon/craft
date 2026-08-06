# 332 — The drift baseline is regenerated in this change

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** none

## Context

`docs/contributing/metrics-baseline.report.json` is the committed drift baseline and was
produced by the broken path. Drift compares per-phase means, so a corrected miner reads as a
~100x move on every phase, forever. Left alone, the drift signal becomes permanent noise —
which is the advisory signal failing exactly when the change most needs it.

## Options considered

1. **Regenerate in this change** (designer's recommendation) — pros: restores the drift signal
   immediately / cons: recomputed consumers move in the same commit.
2. **Regenerate and archive the pre-fix snapshot** — pros: preserves history / cons: the
   archived file has no consumer, and its only use is exactly the invalid cross-boundary
   comparison.
3. **Delete and re-seed on the next run** — pros: no regeneration work / cons: leaves
   `--baseline` broken in the interim.

## Decision

Ratified by the user: **option 1**. The baseline is regenerated from the local corpus with the
fixed miner, in this change.

Ordering constraint: the baseline must be regenerated **after** the priced-cost correction
(ADR-338) and **with** main-loop inclusion on by default (ADR-329). Regenerating before either
lands would bake a second stale baseline.

## Consequences

- `engine/test/telemetry-claims.test.js` and the README FAQ numbers recomputed from this file
  (run count, median/min/max hours) will move; the `readme-drift` guard will demand the README
  be updated in the same commit.
- Under ADR-338 the regenerated baseline carries corrected dollar figures rather than the
  current `$31,171,735.70` artifact.
