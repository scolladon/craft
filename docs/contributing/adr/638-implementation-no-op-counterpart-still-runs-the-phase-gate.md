---
subjects:
  - skills/implementation/SKILL.md
  - skills/run/SKILL.md
  - docs/contributing/specs/run-record.md
---
# 638 — Implementation's no-op counterpart lives in its Preamble and still runs the phase gate

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/planning-no-op-outcome.md · **Supersedes/Refines:** refines ADR-103

## Context

Implementation's Preamble required a plan that passes plan-lint. After a planning no-op that commits no plan (ADR-636, ADR-637), implementation would refuse. Implementation is a floor phase (ADR-144) and the workflow is never gateless. A rebuild after compaction must resume a half-done no-op.

## Options considered

1. **Preamble branch keyed on the run record, gate still runs** *(recommended)* — pros: a Procedure `override:` cannot bypass it; the gate proves the earlier phase's commit left the branch green / cons: one ledger grep in the Preamble.
2. **Procedure branch** — cons: a manifest `override:` replaces the Procedure and loses the guard.
3. **Skip the phase gate on a no-op** — cons: breaks "never gateless" and lets a red decisions-phase commit reach review.

## Decision

Adopted as recommended (no user judgment). Implementation Preamble 2: the plan must exist and pass plan-lint, unless no plan exists at `<plan-dir>/<slug>.md` and the run record holds a `NO-OP(planning):` line. Then the phase spawns nothing, appends no `PART` line, skips Procedure 1–2 and runs Procedure 3 (`gates.phase` once). On green, one append carries `NO-OP(implementation): no plan parts — planning recorded NO-OP(planning)`, `GATE(implementation): green` and `PHASE-DONE(implementation): no-op — no plan parts`. On red, the `NO-OP` line and `GATE(implementation): red` land without `PHASE-DONE`; the fix is committed, the gate re-runs, and `PHASE-DONE` lands only with a green gate, so a rebuild never reads a red phase as closed. A plan file next to a `NO-OP(planning):` line is a contradiction and escalates `{ implementation, reason, ≤3 options }`. Standalone, with no plan, it refuses as before. Walk step 7 lists both `NO-OP(planning):` and `NO-OP(implementation):` as produced outcomes, never gaps; the idiom is greppable-only in `docs/contributing/specs/run-record.md`. The resume table's `implementation` row gains the no-plan clause: append the missing `NO-OP(implementation)`, run the gate, and close the phase only on green.

## Consequences

- No `part-sizing` memory write on a no-op: no part was sized.
- The engine is unchanged; `deriveRunState` already reads the lines as completed phases.
