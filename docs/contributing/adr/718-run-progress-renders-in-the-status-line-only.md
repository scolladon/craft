---
subjects:
  - hooks/progress/register.tsx
  - hooks/progress/bind.ts
supersedes:
  - adr: "710"
    scope: "the pane, its unasked opening, and the /craft-progress command"
---
# 718 — Run progress renders in the status line only

- **Status:** accepted
- **Date:** 2026-10-30
- **Design:** docs/contributing/design/progress-status-line-bar.md · **Supersedes/Refines:** supersedes ADR-710

## Context

ADR-710 drew a run as a pane that opened unasked on surfaces that dock panes, plus a one-line
status summary and a `/craft-progress` command. In use, the pane reads as invasive, and the
summary line says nothing about what is left.

## Options considered

1. **Status line only, carrying done / working / remaining as a segmented bar** — pros: no
   screen space taken, no window opening unasked / cons: no nesting; detail comes from asking
   the session
2. **Keep the pane, open it only on `/craft-progress`** — cons: keeps a surface and a command
   for a view the session can give on request
3. **Band above the prompt** — cons: costs prompt height on every turn

## Decision

Option 1, ratified by the user. The pane, its unasked opening, and `/craft-progress` are
removed; for more detail the user asks the session.

Superseded from ADR-710: the pane, its unasked opening, and the /craft-progress command.

Carried forward from ADR-710: the status line as the run's summary surface, and its
attention segment.

## Consequences

Nesting (plan parts, review cycles) is no longer drawn; the review cycle survives as a `c<n>`
suffix on the working phase. The mod draws nothing but the status line.
