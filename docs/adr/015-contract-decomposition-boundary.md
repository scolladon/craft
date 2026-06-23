# 015 — Contract decomposition boundary: U + 6 bundles (incl. `refinement`)

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-customizable-engine.md · docs/DESIGN-P5-contract-injection.md · **Supersedes/Refines:** refines ADR-003/006

## Context

P5 relocates the invariant contract out of the agent bodies into the engine-owned store
(ADR-003). That forces a boundary decision: which invariants are **universal** (the always-on
core), which are **archetype/role bundles** named by `contract:`, and which text is
**role-specific craft** that stays in the (now thin) agent. The DESIGN proposed `U` + 5 bundles
and left the `refinement` archetype (`refactoring`) with `contract: []` — its behavior-preserving
invariants stranded in `refactor-executor.md`.

## Options considered

1. **U + 5 bundles**; refactor's behavior-preserving text stays as agent craft (`refactoring`
   keeps `contract: []`) — fewest fragments, `pipeline/default.yml` untouched / a swapped refactor
   agent could silently drop "behavior-preserving" — the exact G5 leak P5 exists to close.
2. **U + 6 bundles** — add `refinement` (behavior-preserving; tests change only mechanically; one
   atomic refactor commit; gate-green throughout); `refactoring.contract: [refinement]` — every
   archetype's invariants become engine-owned and swap-safe / one-line `default.yml` edit +
   `BUNDLE_VOCAB` grows by one (golden-safe — no scenario asserts a descriptor's `contract` value).
   *(chosen)*
3. **Refine the U-vs-bundle split line-by-line** — maximal control / re-opens a settled design.

## Decision

The store is the always-on **`core` (U)** plus **6** bundles: `producer`, `construction`,
`harness-read`, `harness-exec`, `delivery`, **`refinement`**. The `refinement` bundle carries the
behavior-preserving invariants relocated from `refactor-executor`; `refactoring.contract` becomes
`[refinement]`. **Boundary rule:** an invariant that **must survive an agent swap** → a bundle (or
U); a **method or identity particular to one role** (designer's empirical-pinning method,
part-implementer's "the part, the whole part", refactor-executor's "you execute HOW, never
decide WHAT") → agent craft. `BUNDLE_VOCAB` grows to 7 (`core` + 6).

## Consequences

Every archetype's binding invariants are engine-owned — a swap of *any* role (including refactor)
cannot drop them; G5 is closed structurally, not by convention. The one-line `default.yml` change
is golden-safe (the scenario/resolve suites assert ids, roles, archetypes, gates, waivers — never
raw `contract` values; verified). Pairs with ADR-003 (fragment files) and ADR-006 (`contract:` is
a list).
