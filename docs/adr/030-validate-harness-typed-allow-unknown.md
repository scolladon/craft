# 030 — validateHarness: typed knobs, allow unknown sub-keys

- **Status:** accepted
- **Date:** 2026-06-17
- **Design:** docs/DESIGN-P8-harness-config.md · **Supersedes/Refines:** none

## Context

`phases.<id>.harness` is now an accepted field (ADR-028). How strictly should `manifest.js` check
its sub-keys? PRD §8 fixes the canonical knobs (`dimensions`, `passes`, `max_cycles`,
`convergence ∈ {low-only|none|numeric}`, `tool`, `scope`, `incremental`) but also promises "the
same shape extends to any harness a repo adds" — e.g. `dependency-cruiser` carries a `rules:`
path that forge does not enumerate. A validator that rejects unknown sub-keys would block that.

## Options considered

1. **Shape-only** — accept any object, no per-knob checks. Lets `max_cycles: 'three'` through to
   the walk.
2. **Typed + reject unknown** — strictest; but blocks repo-specific harness config (`rules:`) unless
   forge enumerates every tool's knobs forever.
3. **Typed + allow unknown sub-keys** — type-check the known knobs, pass unknown sub-keys through
   untouched. Catches real mistakes without blocking "any harness a repo adds". *(user choice)*

## Decision

A named private `validateHarness(harness, phaseName, errors)` (mirroring `validateReorder`'s
shape-check style), called from `validatePhaseBlock` when `field === 'harness'`. It requires
`harness` to be a non-null, non-array object, then type-checks each KNOWN sub-key only when present
(all optional): `dimensions` = list of strings; `passes`/`max_cycles` = positive integers (>0);
`convergence` = the string `low-only`/`none` OR a number ≥ 0; `tool`/`scope` = strings;
`incremental` = boolean. **Unknown sub-keys are allowed** (passed through, no error). Errors
accumulate (no short-circuit), consistent with `validateReorder`/`checkReorderApplicability`.

## Consequences

`max_cycles: 'three'`, `passes: 0`, `convergence: 'sometimes'`, `dimensions: 'code'` (not a list),
`incremental: 'yes'` are all caught at lint time with a per-knob message; `rules: .dep-cruiser.json`
and any other repo-specific sub-key pass. The validator never needs to learn a new tool's vocabulary
— forward-compat is structural. Numeric `convergence: 0` is valid (a non-negative threshold), so the
"only zero-findings converges" tuning is expressible. Semantic meaning of the knobs (how the walk
acts on them) is the skill's domain, not the validator's.
