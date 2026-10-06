---
subjects:
  - docs/contributing/maintainer-smokes.md
  - docs/guides/model-class-matrix.md
---
# 389 — The model-class sweep reaches agent tiers through the sub-agent model override

- **Status:** accepted
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

`agents/planner.md` and `agents/reviewer.md` pin `model: opus`, so `claude plugin eval --model <id>` changes only the session tier; the planner and structured-review cells would show no tier spread. Claude Code 2.1.291 carries `CLAUDE_CODE_SUBAGENT_MODEL` (and a `_FORCE` companion); a case's `env` accepts only `EVAL_*` keys, so only the operator's shell can set it, and its propagation into the eval child is not yet observed.

## Options considered

1. **Export `CLAUDE_CODE_SUBAGENT_MODEL` (plus `_FORCE` if the pin otherwise wins) beside `--model`, confirmed by a paid smoke** *(recommended)* — pros: real tier spread on agent rows / cons: depends on an unobserved propagation
2. **Session tier only; agent rows recorded "pinned: opus"** — pros: no assumption / cons: the two rows the sweep exists for show no spread
3. **No eval sweep** — pros: nothing to maintain / cons: the matrix keeps its never-run status

## Decision

Ratified by the user: option 1. The sweep procedure exports the override beside `--model`. The smoke that drives the reviewer case under a haiku override decides it: if the sub-agent tier does not follow, the procedure falls back to option 2 and says so.

## Consequences

- The procedure records which form (plain or `_FORCE`) was needed.
- If the fallback fires, the matrix note states the agent rows ran at the pinned tier.
