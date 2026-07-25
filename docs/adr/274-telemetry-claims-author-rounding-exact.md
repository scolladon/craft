# 274 — Telemetry-claim guard recomputes raw values and asserts the author's rounding exactly

- **Status:** accepted
- **Date:** 2026-07-25
- **Design:** docs/design/readme-drift-guards.md · **Supersedes/Refines:** none

## Context

The README FAQ quotes rounded aggregates ("27 telemetered runs", "≈1.3 hours" median,
"half an hour … ≈5 hours" range) derived from `docs/metrics-baseline.report.json`.
Either side can drift: the FAQ hand-edited, or the report regenerated.

## Options considered

1. **Recompute raw + apply per-claim rounding rules, assert equality** *(designer
   recommendation)* — pros: deterministic, trips on any change that moves a rounded
   value / cons: commits to documented conventions.
2. **Tolerance bands** — pros: fewer false alarms / cons: laxer than drift detection
   wants; small real drifts pass silently.
3. **Pinned expected-values table** — pros: explicit / cons: the table is a third
   artifact that drifts.

## Decision

Recompute from the report (run count = `runs.length`; over duration-bearing runs:
min/max/median of summed group `durationMs` in hours) and apply the author's rules —
count exact integer; median rounded to 1 decimal; min to the nearest half hour
(0.5 ⇒ "half an hour"); max rounded to integer — then assert equality with the FAQ
tokens. Median convention: average of the two central order statistics (even n).

## Consequences

Regenerating the baseline report or editing the FAQ numbers independently breaks CI,
naming the claim and both values. The rounding rules and median convention are part of
the guard's contract and documented with it.
