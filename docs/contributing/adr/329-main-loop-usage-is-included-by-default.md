# 329 — Main-loop usage is included by default

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** refines ADR-187

## Context

ADR-187 made inline/main-loop usage opt-in behind `--include-inline`, on the grounds that
accumulating `cache_read` inflates any single inline phase. Under ADR-328 rollups stop being a
token source, so leaving main-loop opt-in means the default report omits it entirely — 190.6M
of 392.7M tokens in the reference session, 2.36B of 3.92B corpus-wide. Shipping a default
report that omits a third to a half of the cost is the same class of defect this change exists
to fix.

## Options considered

1. **Default-on, single main-loop group, `--no-inline` escape** (designer's recommendation) —
   pros: publishes the exact total, refuses the fabricated split / cons: amends ADR-187.
2. **Stay opt-in** — pros: ADR-187 untouched / cons: ships a known under-report as the default.
3. **Default-on with per-phase bucketing** — pros: per-phase granularity / cons: re-adopts the
   approximation ADR-187 deliberately gated.

## Decision

Ratified by the user: **option 1**. Main-loop turns are aggregated into one group with
`role: 'main-loop'` and `phase: null`, included by default. `--no-inline` opts out.
No per-phase split of main-loop cost is ever fabricated.

This refines rather than reverses ADR-187: its objection was to the per-phase *split*, not to
the *total*. Publishing the exact total while refusing the split keeps ADR-187's
"never fabricate" intact.

## Consequences

- ADR-187 is amended; its `--include-inline` section in `docs/contributing/specs/telemetry.md`
  is rewritten rather than deleted.
- Run `slug` is restored on sub-agent groups — `groupByRun` inherits the first non-null slug,
  which previously only main-loop lines carried.
- The regenerated drift baseline (ADR-332) must be produced with the new default, or the first
  run after this change reads as drift on every phase.
