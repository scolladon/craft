# 209 — Standing harness-prune as an on-demand `craft:prune` skill

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/harness-hygiene-prune-gates.md · **B SCOPE RISK resolved**
- **Scope:** workstream B

## Context

Harness drift accumulates against model capability ("delete the harness against each
model release"). Craft has no recurring mechanism to propose pruning now-redundant
invariants, contracts, lints, or skill-prose. The risk: any automation (model-bump
detection, load-bearing auto-classification, an automated pruner, a pipeline phase) turns
this into unbounded engine machinery.

## Options considered

1. **Minimal on-demand `craft:prune` skill, propose-never-dispose** (recommended) — pros:
   pure prose, zero engine code, zero pipeline drag, reverts by deleting the skill dir;
   `contracts/core.md` reused as a fail-closed denylist / cons: manual trigger, no
   automation.
2. **Descope B to its own change** — pros: room to explore a balloon axis / cons: delays
   the mechanism; A & C ship without it.
3. **Drop B entirely** — pros: least work / cons: the drift problem stays unaddressed.

## Decision

**User-ratified: minimal prose B, ship now (option 1).** `craft:prune` is an on-demand
skill: it proposes prune candidates over a declared inspection scope (contracts, lints,
skill-prose) for human ratification, never deletes autonomously (propose-never-dispose),
and treats every line of `contracts/core.md` plus the non-overridable cross-phase
invariants as an undroppable denylist — fail-closed: a candidate touching the core is
refused, not warned. Trigger is manual. **All five balloon axes (B1–B5: auto-detect model
bumps, auto-classify load-bearing, automated pruner, advisory CI signal, new pipeline
phase) were put to the user and declined.**

## Consequences

Zero drag when not invoked; no default-pipeline cost. B reverts independently by removing
`skills/prune/`. The manual trigger is a deliberate floor — automation is a future,
separately-scoped decision if ever wanted. The core denylist guarantees a prune can never
drop a load-bearing invariant.
