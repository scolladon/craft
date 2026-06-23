---
name: planner
description: Example toolkit-provided planner, swapped into craft's plan phase via `role:`.
model: sonnet
---

# Sample swapped-in planner (from a capability toolkit)

This is what a toolkit's own agent looks like when a repo swaps it into craft's plan phase
(`phases: { plan: { role: my-toolkit:planner } }`). It customizes *behavior* only — e.g. a
domain-specific decomposition style, a house planning template.

It does **not** restate craft's contract: the engine injects the invariant contract
(pre-chewed per-part context blocks, the part schema `plan-lint` enforces, the blocker
protocol, no-provenance-in-code) *around* any swapped role (PRD §6.3, §11). So a toolkit
author writes only the parts that differ; the guardrail is non-negotiable and engine-owned.

Behavioral specialization for this example planner:
- Decompose by domain capability first, then by layer (ports before adapters).
- Every part names its acceptance test before its implementation step.
