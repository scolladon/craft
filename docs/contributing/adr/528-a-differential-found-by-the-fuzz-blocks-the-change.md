---
subjects:
  - adapters/codex/test/hook-trust-differential.test.js
  - adapters/codex/src/hook-trust.js
supersedes: []
---
# 528 — A differential found by the fuzz blocks the change

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-13
- **Design:** docs/contributing/design/codex-trust-matcher-differential-fuzz.md · **Supersedes/Refines:** none

## Context

The matcher is a ratified allow-list (ADR-517). The fuzz could find a command it trusts that a shell or node runs differently.

## Options considered

1. **Stop with no commit and escalate the counterexample with an uncommitted red refusal row** *(recommended)*
2. **Commit the fuzz with the counterexample excluded by a predicate** — cons: commits an unratified hole
3. **Fix `hook-trust.js` in this change** — cons: forbidden by the brief

## Decision

Adopted-as-recommended (no user judgment): option 1. The counterexample (seed, index, shell, observation) goes to the user, who chooses between a matcher fix under its own ADR and a ratified residual. Aligns with never committing on a red gate.

## Consequences

Contingency only: 100 000 generated commands at HEAD found none.
