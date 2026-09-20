---
subjects:
  - engine/src/contract.js
  - contracts/core.md
  - pipeline/default.yml
---
# 364 — @@TURN_BUDGET@@ resolves on the descriptor axis, not the execution-mode axis

- **Status:** accepted
- **Date:** 2026-09-20
- **Design:** docs/contributing/design/shrink-agent-context-cost.md · **Supersedes/Refines:** refines ADR-015

## Context

The brief asked for a `@@TURN_BUDGET@@` marker "resolved the way `@@MODEL_RESOLUTION@@` and
`@@ARTIFACT_HANDOFF@@` already are". Those two resolve from `opts.execution` alone — they
are agent-vs-inline carve-outs. A turn budget does not vary by execution mode; it varies by
descriptor. The two are different resolution axes, and the difference is load-bearing:
`contract-equivalence.test.js` asserts that **exactly two** lines differ between agent and
inline assembly for every descriptor, with a comment stating a third must never appear.

## Options considered

1. **Descriptor-driven — `manifest.phases.<id>.turn_budget` then `descriptor.turn_budget`
   then the archetype table, resolving identically in both modes** (recommended) — pros:
   keeps the two-line invariant provable / cons: one small refactor so the variants map is
   passed rather than chosen.
2. **Mode-driven like the existing two markers** — cons: introduces a third differing line
   and fails contract-equivalence for all twelve descriptors, which acceptance forbids.
3. **No marker; append the budget as a separate line after the core block** — cons: puts an
   invariant outside the core fragment, against the contract-decomposition boundary.

## Decision

`@@TURN_BUDGET@@` lives in `contracts/core.md` and resolves from the descriptor, producing
**identical text in agent and inline mode**. `applyCarveOuts` takes its variants map as an
argument instead of selecting it from the execution mode, so mode-variant and
descriptor-variant markers coexist without either becoming the other.

Recorded as **adopted-as-recommended (no user judgment)**: the alternatives are foreclosed by
acceptance criteria already stated in the brief, not by a preference expressed here.

## Consequences

- The exactly-two-differing-lines invariant survives and keeps its meaning.
- The core fragment gains a marker whose value depends on which phase is being assembled —
  new for this file, and worth stating plainly wherever markers are documented.
- A descriptor with no budget must resolve to something; the archetype table is the floor.
