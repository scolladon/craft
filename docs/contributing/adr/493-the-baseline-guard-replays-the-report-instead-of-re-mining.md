---
subjects:
  - docs/contributing/metrics-baseline.report.json
---
# 493 — The baseline guard replays the report instead of re-mining

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/baseline-review-waste-replay-guard.md · **Supersedes/Refines:** none

## Context

The committed baseline carries 15 `review-waste` recommendations computed under the retired `cycles > 2` rule; the shipped rule is `billedTurns > 85`. The backlog entry called regeneration a prerequisite for a guard. Every one of the report's 16 review cycles stores its `billedTurns`, so the current rule can run on the report's own data. A re-mine finds about 5 runs against the committed 25 because transcript retention purged the rest.

## Options considered

1. **Replay from the report** *(recommended)* — pros: the guard and the fix share one function; `runs` stays byte-identical; README claims and the calibration pin stay green / cons: kinds whose input is not persisted cannot be judged
2. **Re-mine first** — pros: a fresh report from the current code / cons: destructive (25 → about 5 runs), changes the README cost FAQ, breaks the calibration pin
3. **Replay now, refresh later** — pros: same as 1 / cons: adds a follow-up nobody asked for; a later refresh agrees by construction anyway

## Decision

Option 1 — ratified by the user. The committed report is brought into agreement by replaying its own `runs` through the current rules, never by re-mining. Regeneration is not a prerequisite for the guard.

## Consequences

The parked 5-run refresh stays parked. A future refresh produced by the current `aggregate` passes the guard by construction.
