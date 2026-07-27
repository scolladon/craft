# 151 — The Pi adapter needs no technique edits

- **Status:** accepted
- **Date:** 2026-06-25
- **Design:** docs/design/despecialize-craft-sources.md · **Supersedes/Refines:** none

## Context

`adapters/pi` mirrors orchestrator behaviour for the Pi runtime. The de-specialization
sweep flagged `mutation`/`stryker` strings there, raising whether pi must be edited in
lockstep.

## Options considered

1. **No technique edits** *(designer recommendation)* — pinned facts: pi handles `validation` as gate-command plumbing (`validationGateCmd`) only; its `probe.js` "mutation" strings are filesystem-mutation sense (`assertMutationsInsideThrowaway`); the one `EQUIVALENT-MUTANT:` comment is a kept dogfood comment. Pros: pi names no technique in a technique sense; editing it would touch only kept comments. Cons: none.
2. **Parallel-update pi for symmetry** — Cons: churns kept dogfood comments and filesystem-sense strings for no principle gain.

## Decision

*Adopted-as-recommended (no user judgment).* Make **no technique edits** to `adapters/pi`.
Its `validation` surface is gate-command plumbing, its `mutation` strings are
filesystem-mutation sense, and its one equivalent-mutant comment is kept dogfood evidence.
This aligns with the standing principle that the pi adapter is a minimal portability
example, not a production runner.

## Consequences

- The source-hygiene grep gate (ADR adjacent / design §test-strategy) allowlists pi's
  filesystem-sense `mutation` strings and its `EQUIVALENT-MUTANT:` comment by path/pattern.
- If pi later grows a technique-naming surface, that is a separate change.
