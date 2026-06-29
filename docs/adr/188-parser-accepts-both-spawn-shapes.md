# 188 — Parser accepts both Agent and Task spawn shapes

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-06-28
- **Design:** docs/design/usage-telemetry-miner.md · **Refines:** 182

## Context

The empirical pin corrected a remembered shape: the live spawn tool_use is named
`Agent` (stock Claude Code aliases it `Task`), and the agent type appears as both
`agentType` (in the rollup) and `subagent_type` (in the spawn input) across harness
versions. Keying on a single name silently zero-attributes the other harness.

## Decision

Adopted as the design recommended (no user judgment): the `claude` binding **accepts both
spawn-tool names** (`Agent` ∥ `Task`) and **both agent-type fields** (`agentType` ∥
`subagent_type`). This is a one-`||` robustness measure local to the binding; the core
never sees either name.

## Consequences

The miner attributes spawns across harness versions without a config switch. The
robustness lives entirely in the binding (ADR-182), so the core stays clean. A future
third spawn alias is a one-line binding edit.
