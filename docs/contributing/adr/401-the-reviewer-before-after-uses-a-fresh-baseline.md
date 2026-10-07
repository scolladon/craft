---
subjects:
  - docs/guides/model-class-matrix.md
---
# 401 — The reviewer before/after uses a fresh baseline

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-07
- **Design:** docs/contributing/design/eval-sweep-followups.md · **Supersedes/Refines:** none

## Context

Evidence, not gate: an edit under `agents/` is shown by running the case that drives it before and after. Between the 2026-10-07 sweep and this change, the session tier (ADR-398), the git route (ADR-399) and the prompt clause (ADR-400) also move the structured-review cells.

## Options considered

1. **A fresh three-run "before" per tier, on the tree with everything but the scale** *(recommended)* — pros: isolates the scale edit / cons: about USD 3
2. **Reuse the 2026-10-07 sweep** — pros: free / cons: confounds the scale with three other changes
3. **A fresh "before" at the haiku column only** — pros: about USD 1 / cons: one tier of evidence

## Decision

Adopted as recommended (option 1). The `reviewer-tests-findings` case runs three times per tier on the commit that carries ADR-398–400 and not ADR-397, then again in the sweep after ADR-397 lands. The with-arm score, Δ and `findings-shape` passes are reported before → after per tier.

## Consequences

- Every paid step is approved one tier at a time.
