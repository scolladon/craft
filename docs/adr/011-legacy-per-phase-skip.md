# 011 — P3 rejects the legacy per-phase `skip` field loudly

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-P3-orchestrator-rewire.md · **Supersedes:** the `PROTECTED` skip guard

## Context

The old skip mechanism was the per-phase field `phases.<id>.skip: true`, guarded by the static
`PROTECTED` list. P3 removes `PROTECTED` (ADR-005: the graph computes stranding) and the engine
reads only the top-level `pipeline.skip: [...]` list — it never consults `phases.<id>.skip`. So
after P3 the per-phase field is **inert**: it would lint clean yet do nothing.

## Options considered

1. **Reject loudly with guidance** — `phases.<id>.skip` becomes a validation error pointing at
   `pipeline.skip: [...]`. Honors manifest validation's own "fail loudly, never silently"
   contract — an inert field that silently no-ops is exactly the trap craft refuses. *(user
   choice — overrides the designer's backward-compat recommendation)*
2. **Keep it lint-valid** — leave `skip` a recognized phase field; lints exit-0 but is a silent
   no-op at the engine. Backward-compatible, but no shipped manifest uses it. *(designer
   recommended)*

## Decision

A per-phase `skip:` field is a **loud validation error** directing the author to the top-level
`pipeline.skip: [...]` list. There is exactly one working skip surface (`pipeline.skip`), guarded
by graph stranding; the legacy surface fails fast with a migration pointer.

## Consequences

The slice-2 `invalid-skip-protected` fixture (`phases.plan.skip: true`) is re-baselined: it stays
**exit 2**, but the asserted message changes from "skip: is refused on protected phase" to the new
inert-field guidance. This is the one deliberate, expected bats regression in P3. "Skip any phase"
(G1) is fully delivered through `pipeline.skip`; no skip path silently does nothing.
