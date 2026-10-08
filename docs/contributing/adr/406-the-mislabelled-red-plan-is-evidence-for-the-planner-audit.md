---
subjects:
  - BACKLOG.md
  - docs/guides/model-class-matrix.md
---
# 406 — The mislabelled-RED plan is evidence for the planner audit

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/recalibrate-failing-test-first-grader.md · **Supersedes/Refines:** none

## Context

The plan that every wording fails (ADR-405) labels an already-passing test as RED. A separate BACKLOG entry plans an audit of that planner defect, which needs before/after evidence.

## Options considered

1. **The matrix note, plus one sentence on the BACKLOG entry "The planner labels an already-passing test as RED"** *(recommended)* — pros: the pointer sits where the audit starts / cons: two places to write
2. **The matrix note only** — pros: one place / cons: the audit does not start there
3. **The closed recalibration entry only** — pros: one place / cons: a closed entry is not read when the audit starts

## Decision

Adopted as recommended (option 1).

## Consequences

- The planner audit can replay that plan through the grader before and after its change.
