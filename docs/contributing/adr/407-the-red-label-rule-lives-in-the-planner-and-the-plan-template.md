---
subjects:
  - agents/planner.md
  - templates/plan.md
---
# 407 — The RED-label rule lives in the planner and the plan template

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/planner-red-label-audit.md · **Supersedes/Refines:** none

## Context

`craft:planner` labels already-passing tests RED. The planner reads `templates/plan.md` on every run and copies its prose into plans, and the template's TDD comment offers "RED entries" as the only label.

## Options considered

1. **`agents/planner.md` plus the `templates/plan.md` TDD comment** *(recommended)* — pros: the template no longer contradicts the agent / cons: two surfaces to keep aligned
2. **`agents/planner.md` only** — pros: one surface / cons: the template still offers RED as the only label
3. **Both, plus a line in `agents/part-implementer.md`** — pros: covers a planned RED that passes on arrival / cons: changes a unit no eval case measures

## Decision

Adopted as recommended (option 1). The agent carries the full rule; the template comment carries its one-line summary.

## Consequences

- `agents/part-implementer.md` is unchanged; its handling of a planned RED that passes on arrival stays out of scope until an eval case measures it. ADR-412 refines this: the implementer contract and handback line now name the `GUARD` entry.
