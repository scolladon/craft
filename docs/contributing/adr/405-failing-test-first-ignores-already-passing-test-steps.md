---
subjects:
  - evals/planning-plan-lints/graders/failing-test-first.md
  - docs/guides/model-class-matrix.md
---
# 405 — `failing-test-first` ignores steps that add only already-passing tests

- **Status:** accepted
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/recalibrate-failing-test-first-grader.md · **Supersedes/Refines:** none

## Context

Under the sonnet judge, the grader failed plans that pin already-passing behaviour before they add the failing `--shout` test. In the faithful replay it failed 14 of 32 genuine-PASS plans. Two one-clause rewordings were replayed against the same 32 plans and 4 hand-built negatives.

## Options considered

1. **w3: the second sentence reads "Steps that add only already-passing tests, before or after that change, neither satisfy nor fail this."** *(recommended)* — pros: 2 of 32 genuine passes failed; all 4 negatives still fail / cons: 2 residual FAILs
2. **w2: the first sentence allows passing tests in the failing test's step** — pros: smaller change of meaning / cons: still fails 10 of 32
3. **Keep the current wording and read the planner Δ by hand** — pros: no change / cons: every sweep needs a hand rescore

## Decision

The user chose option 1, with no further paid replay. The 2026-10-07T21-15 with-craft run 1 plan stays a known judge disagreement: its RED step claims an already-passing test fails, which is a planner defect. The 2026-10-08T06-13 bare run 1 split (FAIL, PASS, FAIL) is recorded as noise.

## Consequences

- A `failing-test-first` FAIL in the next sweep still gets a hand read before the planner Δ is used.
