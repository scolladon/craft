# 143 — Auto-skip splits resolver static eligibility from walk dynamic necessity

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P26-auto-skip-unnecessary-phases.md · **Supersedes/Refines:** none

## Context

Auto-skip must decide, before a phase runs, whether the phase has any work for this change.
The brief's signal — "the actual change, diff shape" — only exists at runtime, inside the
walk. But the safety rails (never skip a floor, never strand a consumer, honour a `required:`
pin) are pure config logic the resolver already owns (`resolvePipeline`, `checkStrandedConsumers`).
Where the decision lives determines where the testable invariant sits.

## Options considered

1. **Resolver static eligibility + walk dynamic necessity** *(designer recommendation, user choice)* — pros: the testable invariant (you can never auto-skip a floor / stranding phase) lives in a pure, mutation-tested resolver helper; the unprovable judgment (is there work?) lives in walk prose where the diff exists; mirrors the P19/P23 split (pure core + orchestrator judgment). Cons: the decision spans two homes.
2. **Fully-static resolver heuristic** — resolver decides the skip from config + descriptor shape alone. Cons: blind to the diff; would auto-skip phases that actually have work.
3. **Fully-dynamic walk decision** — walk decides eligibility *and* necessity. Cons: duplicates `checkStrandedConsumers` in prose; leaves floor-exclusion untested.

## Decision

*Adopted-as-recommended.* The resolver computes per-phase **eligibility** (pure, static,
config-derived) and emits it as an additive `effective[].autoSkipEligible` boolean on the
`Resolution` (default `false`), mirroring how ADR-125 attached `Resolution.policy` without
disturbing `effective[]`/`gateDecisions[]`/`waivers[]`. The walk runs the **necessity probe**
against the live change for eligible phases only, and auto-skips when the phase is provably empty.

## Consequences

- A single pure helper (`computeAutoSkipEligibility`) carries the floor/strand/required invariant;
  it is unit- and mutation-testable.
- The `Resolution` gains one additive field — back-compatible with the existing walk.
- Necessity (the diff-derived judgment) is walk prose, covered by scenario fidelity, never CI-unit
  — the same place the gate-command and mutation-tooling probes already live.
