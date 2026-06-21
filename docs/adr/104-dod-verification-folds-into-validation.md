# 104 — DoD-aware verification folds into the `validation` phase

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P20-dod-aware-verification.md · **Supersedes/Refines:** none

## Context

P20 needs one home where the three verification assertions — (1) architecture alignment, (2) engineering
checks green, (3) the DoD is met — are reconciled into a single recorded, PR-body-carried verdict. The
design surfaced three plug-in points as a genuine fork (DC-1a). The choice is load-bearing because it sets
whether DoD-awareness is an isolated new surface or rides an existing phase's invariant.

## Options considered

1. **New `verify` phase** — its own descriptor after validation/architecture, before propose, with a
   probe-and-no-op preamble + contract bundle + gate. *(designer's recommendation)* — pros: isolated,
   per-repo overridable/skippable, one home for the reconciliation / cons: a whole new phase + gate for
   every pipeline that wants it.
2. **Fold into the `propose` pre-gate** — DoD-met becomes one more `pr.pre-pr-gate` check — cons: overloads
   the ship gate; couples DoD to propose's already-dense cross-phase invariant.
3. **Fold into the `validation` phase** *(chosen)* — the DoD-met assertion + reconciliation become part of
   `validation` — pros: zero new descriptor; validation already gates propose (`awaitingHarnesses`), so the
   DoD check is gated for free; the phase that runs the mutation evidence also checks it off the DoD / cons:
   widens validation's responsibility; the DoD check must be decoupled from validation's mutation-tooling
   no-op.

## Decision

DoD-aware verification is **part of the `validation` phase**, not a new phase and not the propose pre-gate.
`validation` gains the DoD-met assertion and the reconciliation of (1)(2)(3). Because `validation` is already
an executing-harness that gates `propose` via `awaitingHarnesses: [validation]`, the DoD check inherits that
gate with **no new gate entry**.

**Non-negotiable structural rule:** the DoD assertion runs **independently of validation's mutation-tooling
no-op probe**. Today `validation` no-ops entirely when no mutation tool is configured; the DoD check must NOT
be short-circuited by that path — it runs whenever the validation phase runs, mutation tool present or not.

## Consequences

- No new descriptor, contract bundle, or gate; `pipeline/default.yml` is unchanged for the phase set.
- `propose`'s existing `awaitingHarnesses: [validation]` already gates the DoD check; the no-op gate-release
  (ADR-082) still applies when the DoD assertion records a `NO-OP(verify):`.
- The `validation` skill/preamble must be restructured so the mutation-absent no-op note does not skip the
  DoD assertion (the two are independent sub-concerns of the phase).
- The DoD-concern no-op token stays **concern-named `NO-OP(verify):`** (ADR-107), distinct from validation's
  mutation-absent note, so both remain greppable and non-colliding.
- The DoD-met reconciliation reads, but never re-runs, the mutation/gate results (ADR-108).
