---
subjects:
  - docs/contributing/maintainer-smokes.md
  - docs/guides/model-class-matrix.md
---
# 390 — The eval sweep fills only the planner and structured-review matrix rows

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

`docs/guides/model-class-matrix.md` has five dimensions (planner, part-TDD, structured-review, blocker, full-pipeline-completion) plus per-phase tokens, filled by a full-pipeline procedure in the maintainer smokes. No eval case reaches part-TDD, blocker, completion or per-phase tokens.

## Options considered

1. **One matrix section; the eval sweep fills planner and structured-review, the full-pipeline run keeps the rest; template shape unchanged** *(recommended)* — pros: one procedure per artifact cell / cons: two procedures feed one table
2. **A separate eval-sweep section owning every row it can** — pros: self-contained / cons: two procedures over one artifact drift
3. **Replace the full-pipeline sweep with evals** — pros: cheaper / cons: three dimensions lose their only source

## Decision

**adopted-as-recommended (no user judgment).** Option 1. The eval sweep fills the planner and structured-review cells (PASS = with-arm mean 1.0, PARTIAL ≥ 0.5, FAIL < 0.5). The trigger, decisions and prune results go in a one-line note under the table. The matrix template's shape does not change.

## Consequences

- The model-class section of the maintainer smokes is amended, not duplicated.
