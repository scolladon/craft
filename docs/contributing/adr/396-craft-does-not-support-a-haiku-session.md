---
subjects:
  - README.md
  - docs/guides/model-class-matrix.md
---
# 396 — craft does not support a haiku session

- **Status:** accepted
- **Date:** 2026-10-07
- **Design:** docs/contributing/design/eval-sweep-followups.md · **Supersedes/Refines:** none

## Context

In the 2026-10-07 eval sweep a haiku session loaded `craft:planning`, said the phase was running in the background and ended its turn without spawning `craft:planner` (2 of 3 runs, and the pilot). The session runs `/craft:run`, every phase skill and every `execution: inline` phase, so this is a session-tier gap, not a planner-agent one. Either the planning skill is reworked so its first step is an action haiku takes, or the session tier gets a stated floor.

## Options considered

1. **Documented floor: a haiku session is unsupported; haiku stays routable per agent** — pros: no skill change chasing one tier's turn-ending habit; the matrix measures haiku where craft routes it / cons: a haiku-only user gets no supported path
2. **Rework the planning skill so its first actionable step is the spawn** — pros: may lift the haiku session / cons: one skill of many; other phase skills share the shape, so the fix does not generalise

## Decision

Ratified by the user: option 1. The session model must be opus or sonnet. haiku is supported only as an agent tier, through `models.<agent>` or `models.fallback`. No skill changes for a haiku session.

## Consequences

- README carries a FAQ entry naming the supported session tiers.
- The model-class matrix states the floor in its note; its columns name the agent tier (ADR-402).
- A haiku-session failure is not a bug report against a phase skill.
