# 018 — R8 guard: deterministic assembled-block equivalence, not an LLM diff

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-customizable-engine.md · docs/DESIGN-P5-contract-injection.md · **Supersedes/Refines:** none

## Context

P5 must prove the relocation changed no **binding content** — SC1's "the contract relocation must
not change spawn content". The BACKLOG's historical phrasing of the guard was a *fixed-prompt
agent-output diff*: spawn the agent before and after, diff its output. That is nondeterministic
(LLM sampling) and cannot gate CI.

## Options considered

1. **Deterministic block-equivalence test** — per default-pipeline phase, assert the assembled
   production block carries every invariant its archetype + bundles must (a fixed checklist of
   invariant markers), and the inline variant swaps exactly the two carve-out lines. Pure,
   CI-gating, no LLM. *(chosen)*
2. **Keep the LLM agent-output diff** — faithful to the original intent / nondeterministic, cannot
   gate CI, flaky.
3. **Both** — deterministic in CI + a one-off manual spot-check / the spot-check adds nothing the
   block-equivalence doesn't already prove.

## Decision

The R8 guard is a **deterministic `node:test`** over the assembled production block (sourced from
`contracts/` via the same path the walk uses): for every phase descriptor, U invariants are present;
each named bundle's invariants are present; the inline variant swaps **exactly** the two carve-out
lines (artifact-handoff, model) and nothing else. The equivalence that matters is the **injected
block** — which is deterministic — not a sampled spawn transcript. The historical "agent-output
diff" is retired.

## Consequences

The relocation is guarded every commit with zero LLM flakiness; the test doubles as living
documentation of the bundle→invariant mapping. Because the literal spawn output is strictly
downstream of a now-proven block, re-baselining a spawn transcript is unnecessary.
