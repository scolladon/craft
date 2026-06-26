# 154 — Keep the review→harness advisory coupling, generalized off the mutation noun

- **Status:** accepted
- **Date:** 2026-06-25
- **Design:** docs/design/despecialize-craft-sources.md · **Supersedes/Refines:** none

## Context

`skills/review/SKILL.md` and `agents/reviewer.md` let the tests dimension flag
"suspected-equivalent mutants" as advisory notes that feed "the mutation triager's prompt"
— a useful cross-phase head-start for triage, but expressed in mutation-specific
vocabulary inside agnostic-required sources.

## Options considered

1. **Keep, generalized** *(designer recommendation)* — rename the noun to "suspected-benign harness findings"; the tests dimension MAY flag advisory notes the executing-harness consumes; the validation skill passes them verbatim to `harness-triager`. Pros: preserves the triage head-start; only the technique noun is removed. Cons: none beyond the rename.
2. **Drop the coupling entirely** — Cons: loses a real triage head-start for no principle gain.
3. **Per-technique opt-in channel** — Cons: over-engineers a one-line advisory channel.

## Decision

*Adopted-as-recommended (no user judgment).* Keep the cross-phase advisory channel,
generalized: the review tests dimension MAY flag **suspected-benign harness findings** as
advisory notes kept for the executing-harness phase; the validation skill injects them
verbatim into the `harness-triager` spawn. The channel (review note → triager prompt) is
preserved; the mutation-specific noun is removed.

## Consequences

- `skills/review/SKILL.md` and `agents/reviewer.md` carry technique-neutral advisory
  wording; the value of pre-flagged benign findings is retained for any triage technique.
- The triager spawn continues to receive these notes verbatim alongside the technique's
  own triage procedure.
