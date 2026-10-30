---
subjects:
  - hooks/progress/register.tsx
---
# 710 — Run progress renders as a pane with a status-line summary

- **Status:** superseded by ADR-718
- **Date:** 2026-10-27
- **Design:** docs/contributing/design/run-visibility-task-list.md · **Supersedes/Refines:** none

> **Superseded by ADR-718.** The pane, its unasked opening, and the `/craft-progress` command
> are removed; the status line stays as the run's summary surface.

## Context

Claude Code exposes no task-list tool to the orchestrator or its spawns (probe on CLI 2.1.311), so a mod is the only binding for a live run view. A mod can draw a pane, a band above the prompt, or a status-line entry. The view must nest plan parts and review cycles under their phases.

## Options considered

1. **Pane for the nested list, a one-line status summary, and `/craft-progress` to open the pane** *(recommended)* — pros: nesting without taking prompt height; the status line works at any width / cons: a pane seats unasked only on wide surfaces
2. **Band above the prompt** — cons: costs vertical room on every screen
3. **Status line only** — cons: cannot show nesting

## Decision

Option 1. The pane holds the nested list; the status line carries `craft <run-id> · <phase> · <done>/<total> · <attention>`; `/craft-progress` opens the pane where it was not seated unasked.

## Consequences

Narrow terminals still get the one-line summary. The pane opens unasked at most once per bind.
