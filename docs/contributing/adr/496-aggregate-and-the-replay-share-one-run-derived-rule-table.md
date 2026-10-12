---
subjects:
  - engine/src/observability/usage-aggregate.js
---
# 496 — aggregate and the replay share one run-derived rule table

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/baseline-review-waste-replay-guard.md · **Supersedes/Refines:** none

## Context

The run-derived builders are private to `usage-aggregate.js`. If the replay called them by name, a third run-derived rule could ship in `aggregate` and be missing from the replay — the same silent staleness this change fixes.

## Options considered

1. **`replayRecommendations` in `usage-aggregate.js` plus a `RUN_DERIVED_RULES` table `aggregate` also consumes** *(recommended)* — pros: one list of rules; `aggregate` output byte-identical / cons: touches `aggregate` by one line
2. **Same function, `aggregate` untouched** — pros: smaller diff / cons: the two lists can drift
3. **A new module** — pros: separation / cons: exports builders that are private today

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** `replayRecommendations(report)` is exported from `engine/src/observability/usage-aggregate.js`, and `aggregate` builds its run-derived recs from the same `RUN_DERIVED_RULES` table. Aligns with DRY: one list of rules.

## Consequences

Adding a run-derived rule means adding a table row, which the replay picks up automatically.
