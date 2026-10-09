---
subjects:
  - docs/contributing/maintainer-smokes.md
  - docs/guides/model-class-matrix.md
---
# 419 — The agent sweep runs the implementer case without filling part-TDD

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/implementer-guard-eval.md · **Supersedes/Refines:** none

## Context

The model-class matrix "Eval sweep" runs `--tag agent` per tier and fills the planner and structured-review cells. The new case carries the `agent` tag, so every sweep runs it.

## Options considered

1. **The "Eval sweep" paragraph names the case; per-tier results go in the matrix note; the part-TDD cell stays with the full-pipeline run** *(recommended)* — pros: no overclaim / cons: part-TDD stays unfilled by the sweep
2. **The case also fills the part-TDD cell** — pros: one more cell from cheap runs / cons: a one-part `GUARD` probe is not full-pipeline TDD
3. **A separate tag** — pros: `--tag agent` unchanged / cons: contradicts the brief's tag

## Decision

Adopted-as-recommended (no user judgment): option 1.

## Consequences

- Agent-sweep ceilings include the implementer case's pilot cost.
