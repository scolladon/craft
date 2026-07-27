# 180 — The dod-assert bin is a CQS reporter, not a gater

- **Status:** accepted
- **Date:** 2026-06-28
- **Design:** docs/design/activate-dod-and-live-doc-lints.md · **Decision:** adopted-as-recommended (no user judgment)

## Context

The DoD auto-assertion runs through a thin engine bin invoked by the `validation` skill
(ADR-178). The bin can either *report* per-criterion outcomes (a query) or *gate* by
encoding met-ness into its exit code (a command). The skill already owns blocker
escalation and the headless-halt path.

## Options considered

1. **Reporter** — exit 0 with per-criterion `{id, kind, outcome}` whenever assessable;
   non-zero only on operational error. Pros: keeps "couldn't assess" distinct from
   "assessed unmet"; CQS-clean query; engine stays policy-free. **(recommended)**
2. **Gater** — non-zero when any `auto` criterion is `unmet`. Cons: conflates an
   operational failure with a verdict; duplicates escalation the skill already owns.
3. **Tri-state exit code** — encode met/unmet/error in the code. Cons: lossy for
   multi-criterion runs; still conflates query and command.

## Decision

Adopted as recommended (no user judgment, aligns with the CQS principle): the bin is a
query. It prints per-criterion outcomes and exits 0 whenever it could assess, non-zero
only on operational error (unreadable DoD, malformed frontmatter). The `validation` skill
reads the report and owns escalation of any `auto` `unmet` as a blocker (and the
headless-halt).

## Consequences

Escalation policy stays in the skill where it already lives; the engine core/bin stay
side-effect-free queries; a future caller can consume the same report without inheriting
a gating decision.
