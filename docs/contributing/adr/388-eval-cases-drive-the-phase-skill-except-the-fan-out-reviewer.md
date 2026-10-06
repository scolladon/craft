---
subjects:
  - evals/**
---
# 388 — Eval cases drive the phase skill, except the fan-out reviewer, which is driven directly

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

A case can drive a craft phase skill or the agent behind it. `craft:review` fans out one opus reviewer per dimension, so driving it costs several spawns per run, times six runs per case. The planning skill's own plan-lint call is the observable its case grades.

## Options considered

1. **The phase skill where it runs in-session or lints; the agent directly where the skill fans out** *(recommended)* — pros: one spawn for the reviewer case, the lint line stays observable for planning / cons: two drive styles
2. **Always the phase skill** — pros: uniform / cons: the review fan-out multiplies cost
3. **Always the agent** — pros: cheapest / cons: loses the skill-level observables (plan-lint line, decisions no-op, prune refusal)

## Decision

**adopted-as-recommended (no user judgment).** Option 1. `run`, `decisions`, `prune` and `planning` cases drive the skill; the reviewer case drives `craft:reviewer` on one dimension through `Agent`.

## Consequences

- A future case for another fan-out phase follows the reviewer pattern.
