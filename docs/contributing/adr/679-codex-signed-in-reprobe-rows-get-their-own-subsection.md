---
subjects:
  - docs/contributing/specs/codex-poc-record.md
supersedes: []
---
# 679 — Signed-in codex re-probe rows get their own subsection under the version section

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/codex-0163-rules-reprobe.md · **Supersedes/Refines:** none

## Context

The 0.163.0 section's method paragraph says no step needed auth. The app-server and TUI rules probes and the launch-flag probe ran later the same day, the first two signed in, so they followed a different method.

## Options considered

1. **A `### Rules paths and launch flag (0.163.0, signed in)` subsection inside `## Re-probe — codex-cli 0.163.0`, with its own method paragraph** *(recommended)*
2. **Append the rows to the existing table** — cons: rows sit under a method they did not follow
3. **A new top-level section** — cons: splits one version across two sections every citation names once

## Decision

Adopted-as-recommended (no user judgment): option 1. Aligns with ADR-320 (one dated re-probe section per version, each row under the method it followed).

## Consequences

Citations of *Re-probe — codex-cli 0.163.0* stay valid; the existing method paragraph is scoped to its own table.
