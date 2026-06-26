# 155 — Emit `harness.techniquePlan` from the resolver, mirroring `deriveReviewPlan`

- **Status:** accepted
- **Date:** 2026-06-25
- **Design:** docs/design/despecialize-craft-sources.md · **Supersedes/Refines:** none

## Context

The review harness carries a raw consumer knob (`dimensions`) plus an **engine-emitted**
`reviewPlan = { passes, stop_rule }` (`engine/src/resolve.js` `deriveReviewPlan`), so
defaults resolve once in pure engine code and the skill reads a binding plan. The
executing-harness has no analogue today — `validation.harness` reaches the skill raw. The
new `harness.techniques` knob needs its defaults (mode, run-style, scope inheritance,
commit-prefix) resolved somewhere.

## Options considered

1. **Emit `techniquePlan`** *(designer recommendation)* — `deriveTechniquePlan(harness)` projects each declared technique into a resolved descriptor with defaults filled, attached to executing-harness descriptors in `effective[]`, mirroring the review attach. Pros: defaults resolved once in pure, testable engine code; no skill/engine default-drift. Cons: a little more engine surface.
2. **Skill reads `techniques[]` raw and applies defaults itself** — Cons: duplicates default logic in prose; drift risk between skill and engine.
3. **Emit the plan only for `validation`, not `architecture`** — Cons: reintroduces the per-phase special-case the generic mechanism removes.

## Decision

*Adopted-as-recommended (no user judgment).* Add `deriveTechniquePlan(harness)` to the
resolver, mirroring `deriveReviewPlan`. It projects every declared technique into a
resolved `{ id, probe?, run?, scope, mode, runStyle, triageProcedure?, commitPrefix }`
with defaults filled, and is attached as `harness.techniquePlan` to **executing-harness**
descriptors (`archetype: harness` ∧ `harness-exec ∈ contract`) in `effective[]`. The
predicate shared with `gates.js` (`isExecutingHarness`, currently module-private) is
extracted to a shared module so both bind one definition. The skill reads
`phase.harness.techniquePlan` (binding, engine-emitted) the way `review` reads `reviewPlan`;
skill-discovered techniques (ADR-149) are resolved with the same defaults at skill runtime.

## Consequences

- `engine/src/resolve.js` gains `deriveTechniquePlan`; a shared `isExecutingHarness` is
  extracted from `gates.js` (no second copy).
- `deriveTechniquePlan` is a pure projection — unit- and property-testable (every input
  technique appears once with defaults resolved).
- The skill never re-derives defaults; declared and discovered techniques resolve through
  the same default set.
