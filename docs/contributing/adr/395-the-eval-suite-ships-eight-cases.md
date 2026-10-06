---
subjects:
  - evals/**
---
# 395 — The eval suite ships eight cases

- **Status:** accepted
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

The brief asks for five to eight cases. The two opus-pinned agent cases (planner, reviewer) carry most of the cost; the trigger and decisions cases run on the session model and are cheap. The CLI's authoring guidance asks for at least two fire input shapes and at least one should-not-fire case.

## Options considered

1. **Eight cases, including the second trigger phrasing and the decisions escalation pair** *(recommended)* — pros: two trigger shapes, and an unconditional `NO-OP(decisions):` cannot pass / cons: two more cheap cases per run
2. **Seven: drop the second trigger phrasing** — pros: cheaper / cons: one fire input shape
3. **Six: drop both** — pros: cheapest / cons: the decisions no-op case becomes passable by a constant

## Decision

Ratified by the user: option 1. The suite ships `run-fires-craft-this`, `run-fires-default-workflow`, `run-quiet-unrelated`, `planning-plan-lints`, `reviewer-tests-findings`, `decisions-noop-when-clear`, `decisions-escalates-fork` and `prune-refuses-core`.

## Consequences

- Tags `trigger`, `phase` and `agent` let a maintainer run the cheap subset first.
