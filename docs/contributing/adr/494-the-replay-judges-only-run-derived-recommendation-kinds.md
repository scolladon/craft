---
subjects:
  - engine/src/observability/usage-aggregate.js
---
# 494 — The replay judges only run-derived recommendation kinds

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/baseline-review-waste-replay-guard.md · **Supersedes/Refines:** none

## Context

Recommendation kinds differ in whether their input survives into the report. `review-waste` reads `reviewCycles` and `turn-budget` reads `phaseTurns`, both stored on each run. `model-routing` and `cache-hotspot` need `cacheCreationTtl` and the price table, neither persisted: replaying them from report groups mis-prices 25 of 110 groups and yields 4 `model-routing` recs against the committed 2, two of them same-model. `phase-skip` markers are not stored at all.

## Options considered

1. **`review-waste` only** — pros: minimal / cons: `turn-budget` stays unguarded once a refresh brings `phaseTurns` in
2. **Every run-derived kind (`review-waste`, `turn-budget`)** *(recommended)* — pros: covers each kind whose whole input is on the run / cons: `turn-budget` replays over zero runs today
3. **All kinds** — pros: complete on paper / cons: unfaithful — red on a correct report

## Decision

Option 2 — ratified by the user. The replay judges exactly the kinds whose whole input is persisted on each report run: `review-waste` and `turn-budget`. Every other kind passes through verbatim.

## Consequences

A new rule joins the replay only when its input is persisted on report runs. `model-routing`, `cache-hotspot` and `phase-skip` stay unguarded until the report persists their inputs.
