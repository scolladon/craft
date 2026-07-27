# 218 — opencode Execution binding dispatches subagents

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** none

## Context

The Execution port's `spawn(role, ctx)` needs an opencode binding. The kickoff selected native/interactive packaging over the headless pi-style subprocess adapter (PRD §7).

## Options considered

1. **opencode subagents (`mode: subagent`) via the task tool / `@craft-<role>`; review fan-out = parallel subagents** *(designer recommendation)* — pros: keeps the interactive-TUI value; honours artifact-is-the-handoff + dead-worker-respawn. Cons: constrained by `subagent_depth` (ADR-219).
2. **Per-phase `opencode run --agent` subprocess** — pros: mirrors pi. Cons: discards the interactive TUI the user chose.
3. **Inline-only, no fan-out** — cons: loses parallel review.

## Decision

*Adopted-as-recommended (no user judgment).* `spawn(role, ctx)` = dispatch the opencode subagent `craft:<role>` (`agents/craft-<role>.md`, `mode: subagent`) via the task tool / `@craft-<role>`, gated by `permission.task`; the injected block is prepended, then working dir + task dynamics + artifact paths. Review fan-out = N parallel subagents. `runInline(ctx)` = the opencode primary agent in-session.

## Consequences

- Artifact-is-the-handoff and dead-worker-respawn hold unchanged (the commit is the handoff).
- Depth topology is fixed by ADR-219; if the live smoke shows fan-out degrades at depth 1, the documented fallback is sequential per-phase (a profile, like pi).
