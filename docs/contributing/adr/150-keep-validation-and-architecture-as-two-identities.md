# 150 — Keep `validation` and `architecture` as two phase identities sharing one mechanism

- **Status:** accepted
- **Date:** 2026-06-25
- **Design:** docs/design/despecialize-craft-sources.md · **Supersedes/Refines:** none

## Context

`validation` and `architecture` are the same executing-harness descriptor with different
hardcoded techniques. Extracting one generic mechanism raises whether the two phases
should collapse into one harness phase or keep their separate identities.

## Options considered

1. **Keep both identities, share the mechanism** *(designer recommendation; brief default)* — pros: distinct concerns, distinct gates, distinct default-on/off (`architecture` stays default-off); one shared skill body + one triager. Cons: two descriptors for one mechanism.
2. **Merge into one harness phase** — techniques distinguish concerns. Cons: loses the default-off boundary and the separate gate token; conflates two review lenses.
3. **Keep both, generalize only `validation`** — Cons: leaves `architecture` technique-locked, failing the principle.

## Decision

*Adopted-as-recommended (no user judgment).* Keep `validation` and `architecture` as two
phase identities. Both share the one generic gate-harness mechanism (one skill body, one
`harness-triager`, the `harness.techniques` knob + emitted plan). `architecture` stays
`enabled: false` by default. The only per-phase differences are identity, default-enabled
state, and gate token.

## Consequences

- `pipeline/default.yml` keeps both descriptors; both ship `techniques: []`.
- The generic skill body serves both phases; `skills/architecture/SKILL.md` becomes a
  thin instance of the same mechanism (sync-default rather than background).
- The propose-gate `awaitingHarnesses` set continues to key on phase identity, unchanged.
