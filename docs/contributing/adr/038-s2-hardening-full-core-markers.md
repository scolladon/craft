# 038 — S2 hardening: extend the two existing tests, assert full CORE_MARKERS survive

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P9-agent-swap.md · **Supersedes/Refines:** none

## Context

The two existing S2 tests (`scenarios.test.js:238–269`) are resolution-level: one asserts the swapped
`role` lands on the effective descriptor, the other asserts `assembleContract` on that descriptor still
emits *two* markers (`Never commit on a red gate`, `Decision-candidates`). The P9 gate is "S2 green" as a
*walk-level* guarantee — contract-survives-swap (G5) must be asserted at the assembly boundary the walk
actually uses, across the whole core, not a two-marker spot-check. Tests are pure-Node (no Task harness),
so the assertable guarantee is the structural one: the id-keyed contract block is full and
role-independent.

## Options considered

1. **Extend the two existing S2 tests** — pin role-swapped-but-id-unchanged AND that every `CORE_MARKER`
   (plus the producer-bundle marker) survives on the swapped descriptor's assembled block; reuse the
   `CORE_MARKERS`/`hasCI` shape from `contract-equivalence.test.js`. *(designer's recommendation, user choice)*
2. **Add a third dedicated test** — leave the two untouched, add one for full-marker survival. Same
   coverage, more duplication.
3. **Walk-simulation harness** — stub the Task spawn to assert end-to-end. Over-engineering for a
   structural (id-keyed) property; the real spawn is the manual acceptance check.

## Decision

Extend the two existing S2 tests. The resolution test additionally pins that the swap changes `role` but
leaves `id === 'planning'`. The contract test asserts the FULL `CORE_MARKERS` set (not the two-marker
subset) survives on the swapped descriptor's `assembleContract` output, plus the producer-bundle marker —
proving the swap drops *nothing* from the engine-owned contract. The `CORE_MARKERS`/`hasCI` constants are
reused from `contract-equivalence.test.js` rather than re-listed. No fixture change: `S2/manifest.yml`
(`planning.role: my:domain-planner`) stays as-is.

## Consequences

"Contract-survives-swap" becomes a pinned, regression-guarded property at the exact boundary the walk
uses, for the whole core — a future change that drops a marker on a swapped descriptor fails S2. The
guarantee is asserted structurally (id-keyed block is full and role-independent); the actual end-to-end
Task spawn remains covered by the manual acceptance check (`run/SKILL.md`), not a simulated harness. The
two-marker spot-check is retired in favour of the full set, so the test's strength no longer lags the
contract's surface.
