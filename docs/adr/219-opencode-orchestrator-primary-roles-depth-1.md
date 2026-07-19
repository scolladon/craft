# 219 — orchestrator runs primary; role workers are depth-1 subagents

- **Status:** accepted
- **Date:** 2026-07-17
- **Design:** docs/design/opencode-adapter.md · **Supersedes/Refines:** Refines ADR-218

## Context

opencode's `subagent_depth` defaults to **1**: a primary agent may launch subagents, but those subagents may not launch more. Craft's topology is orchestrator → role workers, with review fan-out orchestrator → N reviewers.

## Options considered

1. **Orchestrator = primary agent, role workers = depth-1 subagents, document `subagent_depth: 1`** *(designer recommendation)* — pros: fits the default depth without raising it. Cons: requires `/craft:run` to run in primary mode (not `subtask`).
2. **Flatten to single-level sequential inline phases** — cons: loses fan-out.

## Decision

*Adopted-as-recommended (no user judgment).* `/craft:run` runs as a primary agent (not a `subtask`); role workers and review reviewers are depth-1 subagents; `subagent_depth: 1` is the documented floor in `opencode.json`.

## Consequences

- Fits the default depth without raising it above 1.
- Whether a command-dispatched primary keeps role spawns at depth 1, and whether fan-out stays parallel at that depth, is a live-smoke item (design §D9 D-row 26).
- Raising `subagent_depth` above the default is out of scope unless the smoke proves the topology needs it.
