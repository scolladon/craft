# 107 — DoD absence is a recorded `NO-OP(verify):` warning, never a block

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P20-dod-aware-verification.md · **Supersedes/Refines:** none

## Context

The brief: DoD absence "raises a warning — NOT a hard block. Absence is allowed but must be surfaced." Craft
already has exactly one first-class mechanism for "this assertion's input was absent, so the phase produced
nothing but must say so loudly": the **recorded no-op** (ADR-082 for gated harnesses; ADR-102/103 for the
vocabulary and PR-body carry). The decision is whether to reuse it or add a new "warning" severity.

## Options considered

1. **Recorded `NO-OP(verify):` no-op** — carried into the PR body (ADR-102), releasing the propose-gate
   (ADR-082). *(designer's recommendation)* — pros: zero new mechanism; single-channel ledger (ADR-005) /
   cons: none material.
2. **Soft gate that emits a distinct "warning" record and passes** — cons: invents a severity the run record
   doesn't have; risks a silent-skip path.
3. **Both** — cons: redundant.

## Decision — *adopted-as-recommended (no user judgment)*

DoD absence is recorded as a first-class no-op line **`NO-OP(verify): no DoD declared — <what was asserted
instead>`** (the ADR-103 `NO-OP(<phase>):` token family, here concern-named `verify`). The line is carried
into the PR body by the existing run-record→body flow (ADR-102) — **no documentation/propose edit, no new
PR-body bullet**. Because the DoD check is gated (it folds into `validation`, ADR-104), the no-op **releases
its propose-gate entry** exactly as a validation runtime no-op does (ADR-082), so absence never deadlocks
`propose`.

The brief's word "warning" is satisfied by *the recorded-and-carried no-op being a non-blocking,
loud-in-the-PR-body outcome*. No new severity channel is introduced.

## Consequences

- `grep -F 'NO-OP('` finds the DoD-absence line alongside every other phase no-op; the ledger stays
  single-channel (ADR-005).
- The token is **concern-named `verify`**, kept distinct from `validation`'s mutation-absent note so a folded
  phase still produces two greppable, non-colliding outcomes (ADR-104).
- A *positive* DoD-met outcome is recorded as `verify: DoD met — …` (distinct from the no-op token, which is
  reserved for absent input), per the design's recorded-vocabulary matrix.
