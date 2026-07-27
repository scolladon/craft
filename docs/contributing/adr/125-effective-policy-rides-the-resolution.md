# 125 — The effective policy rides the Resolution as an additive field, resolved once

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P23-configurable-policy-hooks.md · **Supersedes/Refines:** none

## Context

The merged policy (user + project + per-invocation) must be available to the orchestrator at every
consult seam. craft already computes a `Resolution` JSON once per run via `resolvePipeline`, and the
orchestrator holds it for the whole walk. Where the policy is computed and carried is an architecture
choice that can reuse or duplicate the existing precedence machinery (ADR-022).

## Options considered

1. **Ride the Resolution — additive `Resolution.policy`** *(designer recommendation)* — pros: one resolve call, one precedence home (no DRY drift vs ADR-022); additive field leaves `effective[]`/`gateDecisions[]`/`waivers[]` untouched. Cons: grows the Resolution surface by one field.
2. **Separate `policy-resolve` bin** — pros: isolation. Cons: a second JSON surface and a second precedence home (DRY risk).
3. **Resolve lazily per consult in-session** — pros: no resolver change. Cons: precedence logic in prose rather than the deterministic bin.

## Decision

*Adopted-as-recommended (no user judgment).* `mergePolicyScopes` runs in the resolve path (after
`applyCliOverlay`), and the flat action→verdict map is attached to the `Resolution` as an additive
top-level `policy` field. The orchestrator holds `Resolution.policy` beside the `MemoryView` for the
run and consults it at each seam. One resolve, one precedence home.

## Consequences

- Reuses the ADR-022 single-precedence-home; no second resolver, no DRY drift.
- The Resolution JSON gains one additive field — back-compatible with the existing walk.
- Mirrors how P22 added memory as a held-for-the-run view rather than a per-phase recompute.
