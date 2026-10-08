---
subjects:
  - evals/planning-plan-lints/graders/failing-test-first.md
  - docs/contributing/maintainer-smokes.md
---
# 403 — Grader rewordings are validated through the real judge

- **Status:** accepted
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/recalibrate-failing-test-first-grader.md · **Supersedes/Refines:** none

## Context

The `failing-test-first` grader needed a rewording, and each candidate wording had to be checked before the next paid sweep. A `claude -p` replay of the judge prompt is free, but it reproduced 0 of the 10 real false FAILs. The real judge runs as a side-query with no tools, no thinking and no session context, and `claude -p` cannot strip that context without an API key that has credits.

## Options considered

1. **Faithful replay through a throwaway plugin-eval suite and the real judge** *(recommended)* — pros: grades the same bytes with the same judge call / cons: paid (USD 5.26 for 36 plans × 3 wordings)
2. **`claude -p` offline replay** — pros: free / cons: measured not faithful on this grader
3. **No replay; check at the next sweep** — pros: no extra run / cons: spends a full sweep to test one sentence

## Decision

The user chose option 1. A reworded `llm` grader is checked by planting the recorded focus files in a throwaway suite and grading them with the sweep's judge model, one grader file per wording.

## Consequences

- A `claude -p` replay can still reject a wording cheaply, but it never approves one.
