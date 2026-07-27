# 287 — breaker sweep plus a standing scoped link-check

- **Status:** accepted
- **Date:** 2026-07-27
- **Design:** ../design/docs-audience-split.md · **Supersedes/Refines:** none

## Context

Sibling-relative links survive the tree moves; the breakers are the `adapters/`→`specs/`
rename, the `GUIDE-*`→`guides/` cross-tree move, the `DOD.md`/metrics relocation, and every
root-relative `docs/…` link inside `docs/**`. Requirement 12 says no dangling intra-`docs/`
link remains. The 282-file ADR/archive corpus may carry pre-existing danglers unrelated to
this move.

## Options considered

1. **Rewrite the breakers + add a standing link-check step** *(recommended)* — pros: turns
   "no dangling link" into an enforced invariant / cons: new CI step; must not go red on
   legacy danglers.
2. **Rewrite breakers, verify by one-shot `git grep` audit** — pros: no new CI surface /
   cons: future regressions unguarded; the requirement decays into a one-time promise.
3. **Sweep only load-bearing refs, leave historical links dangling** — pros: least work /
   cons: knowingly ships broken links.

## Decision

Adopted-as-recommended (no user judgment). Mechanically rewrite the named breaker classes
across `docs/**`; add a link-check that resolves relative markdown link targets under
`docs/**` and fails on danglers — baselined or scoped so pre-existing legacy danglers do
not block the migration, and only *new* danglers fail.

## Consequences

Requirement 12 is a standing invariant, not a migration promise. The baseline/scope choice
is an implementation detail owned by the planner; the constraint it must honor is: green on
day one, loud on any new dangler.
