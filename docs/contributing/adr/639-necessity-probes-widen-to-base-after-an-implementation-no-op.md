---
subjects:
  - skills/run/SKILL.md
---
# 639 — Necessity probes read `<base>...HEAD` after an implementation no-op

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/planning-no-op-outcome.md · **Supersedes/Refines:** none

## Context

The walk-step-1 auto-skip signals for `review`, `refactoring`, `validation` and `architecture` look at changes "since `implementation`". When implementation records a no-op, that window is always empty, so any source an earlier phase committed would auto-skip unreviewed.

## Options considered

1. **Widen to `<base>...HEAD` when the run record holds `NO-OP(implementation):`** *(recommended)* — pros: one sentence; a docs/ADR-only run still auto-skips; source landed by an earlier phase is reviewed / cons: none found.
2. **Leave "since implementation"** — cons: silently skips review over source landed before implementation.

## Decision

Adopted as recommended (no user judgment). When the run record holds `NO-OP(implementation):`, the `review`, `refactoring`, `validation` and `architecture` necessity signals are evaluated over `<base>...HEAD`. The normal-run scope is unchanged.

## Consequences

- A run whose only commits are the design doc, ADRs and adr-lint-forced citation sweeps still auto-skips all four.
