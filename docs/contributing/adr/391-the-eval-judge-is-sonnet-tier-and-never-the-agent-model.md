---
subjects:
  - docs/contributing/maintainer-smokes.md
---
# 391 — The eval judge is sonnet-tier and never the agent model

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

`llm` graders are scored by a judge model, haiku by default. The CLI's own authoring guidance sets a sonnet-tier-or-larger floor and forbids judging with the agent's own model (self-preference).

## Options considered

1. **`--judge-model claude-sonnet-5-5`; in the sweep, `claude-opus-5-5` judges the sonnet column** *(recommended)* — pros: meets the floor, never self-judges / cons: one flag swap in the sweep
2. **Always opus** — pros: strongest judge / cons: self-judges the opus column
3. **CLI default haiku** — pros: cheapest / cons: below the floor

## Decision

**adopted-as-recommended (no user judgment).** Option 1. Every documented command passes `--judge-model claude-sonnet-5-5`, except the sweep's sonnet column, which passes `claude-opus-5-5`.

## Consequences

- Judge cost is part of each run's `costUsd`.
