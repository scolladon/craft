---
subjects: []
---
# 411 — RED-label accuracy is counted by hand

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/planner-red-label-audit.md · **Supersedes/Refines:** none

## Context

`failing-test-first` deliberately ignores steps that add only already-passing tests (ADR-405), so no grader sees whether a RED label is accurate.

## Options considered

1. **A hand count of the three defect shapes in every with-craft plan** *(recommended)* — pros: three plans per tier are cheap to read / cons: not automated
2. **A new one-clause `llm` grader, validated through the faithful replay** — pros: automated in every sweep / cons: its own paid replay and a column in every future sweep
3. **Both** — pros: cross-check / cons: the cost of option 2 now

## Decision

Adopted as recommended (option 1).

## Consequences

- If the after-count still shows mislabels, a dedicated grader becomes worth its replay cost.
