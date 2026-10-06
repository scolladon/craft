---
subjects:
  - evals/**
---
# 387 — Craft-only token graders are with-only; every eval case keeps a both-arm outcome grader

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

Under the default `--ablation with-without` each case runs with and without craft, and the headline is the score delta. A grader matching a craft-only token (`NO-OP(decisions):`, `PRUNE-CANDIDATE`, the plan-lint success line) scores the bare model 0 by construction, which inflates the delta without measuring anything.

## Options considered

1. **Token graders `with-only`, at least one `both` outcome grader per case** *(recommended)* — pros: the delta measures behaviour a bare model could also show, which is the evidence prune needs / cons: per-grader arm bookkeeping
2. **Every grader `both`** — pros: uniform / cons: token graders make the delta a vanity number
3. **`--ablation none` for craft-only cases** — pros: halves their cost / cons: breaks the CLI's ablation floor and loses the prune evidence

## Decision

**adopted-as-recommended (no user judgment).** Option 1. A grader that matches a craft-only token is `arm: with-only`. Every case carries at least one `arm: both` outcome grader stating behaviour a bare model could in principle satisfy. `tool_used: Skill` trigger graders leave `arm` unset (display-only).

## Consequences

- A case whose only `both` grader stops discriminating is a finding against the case, not a pass.
- The with-only graders read as a "craft fired" indicator in the report.
