---
subjects:
  - docs/contributing/maintainer-smokes.md
---
# 398 — The eval sweep holds the session at sonnet

- **Status:** accepted
- **Date:** 2026-10-07
- **Design:** docs/contributing/design/eval-sweep-followups.md · **Supersedes/Refines:** refines ADR-389 (the session tier no longer follows the column)

## Context

The 2026-10-07 sweep ran the session at the column tier, so the haiku planner cell measured an unsupported haiku session (ADR-396), not the haiku planner. `CLAUDE_CODE_SUBAGENT_MODEL` with `_FORCE=1` moved the agents, but that sweep had session and override equal, so whether FORCE follows the env model or the session model when they differ is unobserved.

## Options considered

1. **Session at sonnet for every column; only the agent tier varies** *(recommended)* — pros: one variable per column, a supported session everywhere / cons: the opus column loses comparability with 2026-10-07
2. **Session at sonnet for the haiku column only** — pros: opus and sonnet columns stay comparable / cons: mixed session tiers across columns
3. **Session = column tier; haiku planner cell marked a session floor** — pros: no procedure change / cons: the haiku planner stays unmeasured

## Decision

Ratified by the user: option 1, conditional on probe P2. The sweep passes `--model claude-sonnet-5-5` in every column and sets the column's agent tier through `CLAUDE_CODE_SUBAGENT_MODEL=<id>` and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`. P2 is the haiku-column pilot: session events must show sonnet and agent events haiku. If agent events show sonnet, the decision is re-opened with the user before any further sweep step, together with ADR-402 — no silent fallback.

## Consequences

- The sonnet column (session sonnet, agent sonnet) is the control against 2026-10-07.
- The judge rule of ADR-391 is unchanged: the judge is never at the agent's tier; it may share the session's tier.
- The override also reaches agents the bare arm spawns, so both arms run agents at the column tier.
