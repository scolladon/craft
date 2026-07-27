# 108 — DoD subsumes architecture-alignment, with an honest gap-note fallback

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P20-dod-aware-verification.md · **Supersedes/Refines:** none

## Context

P20 names "architecture alignment" as assertion (1), but `pipeline/default.yml` ships the `architecture`
phase **`enabled: false`** with an unresolved `<arch gate>`. DoD-aware verification therefore **cannot assume
a boundary check ran**, and must never claim alignment no check produced. This is the design's CRITICAL
tension (DC-4).

## Options considered

1. **Conditional deferral + honest gap note (engine-owned)** — defer to the arch gate when the phase ran;
   when OFF, record that the boundary check did not run and assert (1) only via a DoD criterion — cons: the
   engine owns a per-state branch.
2. **DoD subsumes (1), with the gap-note as the no-DoD fallback** *(designer's recommendation; chosen)* —
   architecture-alignment is a DoD criterion the repo writes; when the arch phase is ON its green gate is the
   mechanical evidence; when no DoD exists, fall back to a recorded honest gap-note — pros: the brief
   explicitly permits the DoD to subsume (1)(2); nothing for the engine to fabricate / cons: relies on the
   repo's DoD to name the criterion.
3. **Verify warns sub-no-op when arch OFF** — `NO-OP(verify): architecture boundary check did not run` — cons:
   a standalone warning even when the DoD already covers it.

## Decision

Architecture-alignment is asserted by the **DoD subsuming it**: a repo that cares about boundaries writes an
architecture criterion (e.g. "module boundaries clean") into its DoD. When the `architecture` phase **is
enabled and green**, that gate is the mechanical evidence for the criterion; when it is **OFF/no-op'd**, the
criterion is asserted by the DoD on the repo's own terms. When **no DoD exists at all**, the verification
falls back to recording an honest gap-note — *the boundary check did not run* — and **never fabricates
alignment**.

The same subsumption covers assertion (2): engineering checks (gates green, **mutation testing** clean) are
DoD criteria, evidenced by the existing `gates.phase` + `validation` results (ADR-104) and **read, never
re-run** (design Requirement 5 / Out-of-scope).

## Consequences

- The engine never claims an alignment or a check it did not witness; the repo's DoD decides which checks
  matter.
- Pairs with ADR-104: the `validation` phase produces the mutation/gate evidence and, in the same phase,
  checks the corresponding DoD criteria off — the mutation-testing checklist line is evidenced by the very
  phase that hosts the DoD check.
- For a repo with neither a DoD nor an enabled `architecture` phase, the verify outcome is the recorded
  gap-note (a limitation stated, not a pass asserted).
- P20 does **not** flip `architecture`'s `enabled: false`; making verification *aware* of alignment is
  separate from enabling the boundary phase.
