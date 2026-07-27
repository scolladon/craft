# 181 — The shipped backlog template migrates to the live structure

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/activate-dod-and-live-doc-lints.md · **Refines:** 179

## Context

ADR-179 generalizes `backlog-lint`'s required-set to the live `BACKLOG.md` structure.
`templates/backlog.md` ships the generic fresh-repo backlog shape (`## Status at a glance`,
`## Done`, `## Next`, `## Then`, `## Deferred / parked`, `## Notes`), which does not match
the generalized required-set. The design recommended dropping the template from the lint
chain (it is onboarding reference, not a structural instance).

## Options considered

1. **Drop `templates/backlog.md` from `backlog-lint`** — lint only the live `BACKLOG.md`.
   Pros: zero template churn. Cons: the shipped template loses structural guarding.
   *(design recommendation)*
2. **Keep it via a second generic required-set** — parameterize the linter to guard the
   template against the generic set and `BACKLOG.md` against the live set. Cons: two
   required-sets to maintain for a template that needs no per-run enforcement.
3. **Migrate the template to the live structure** — rewrite `templates/backlog.md` into
   the richer live shape so a single generalized required-set guards both. **(chosen)**

## Decision

User judgment — deviates from the design recommendation. `templates/backlog.md` is migrated
to the live backlog structure so one generalized required-set guards both the live
`BACKLOG.md` and the shipped template; both stay in the `ci.sh` lint chain.

## Consequences

Newly-onboarded repos receive the richer roadmap template; the linter keeps a single
required-set (no second generic set, no dropped target). The design doc is revised
(scope-fold) to reflect keep-and-migrate rather than drop. Trade-off accepted: a heavier
onboarding template in exchange for one enforced structure across template and live doc.
