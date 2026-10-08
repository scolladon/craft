---
subjects: []
---
# 410 — The planner audit is baselined per agent tier before the change

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/planner-red-label-audit.md · **Supersedes/Refines:** none

## Context

The kept `planning-plan-lints` plans are valid before-plans for a hand count, but their scores came from the grader before its recalibration (ADR-405), and no haiku plan exists from a sonnet session. The defect is intermittent: three sonnet-tier runs of the same case mislabelled 3 of 3, 1 of 3, then 0 of 3 plans.

## Options considered

1. **A fresh `planning-plan-lints` run per tier on the unchanged tree, plus the kept plans in the hand count** *(recommended)* — pros: scores comparable under one grader; a haiku baseline exists / cons: about USD 1 per tier
2. **Kept plans as the baseline, after-runs only** — pros: half the spend / cons: compares scores across two grader versions
3. **One sonnet after-run against the kept plans** — pros: cheapest / cons: shows no per-tier effect

## Decision

Adopted as recommended (option 1), as the maintainer's brief prescribes. Each paid run is approved one tier at a time.

## Consequences

- With 3 plans per tier per side, one tier's before/after cannot separate the effect from run-to-run noise; the pooled hand count over all before-plans against all after-plans is the headline.
