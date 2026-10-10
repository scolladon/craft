---
subjects:
  - evals/implementer-guard-outside-part/graders/**
---
# 439 — The scope case scores scope-keeping

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/arriving-guard-part-bound.md · **Supersedes/Refines:** none

## Context

The case measures which of two contract clauses an implementer keeps when they conflict. The score must not presume the contract fix the evidence is meant to decide.

## Options considered

1. **Score scope-keeping: the `GUARD` ran red, `lib/name.sh` stayed untouched and was never edited, and the reply left the fix to its owner; blocking versus going on is reported by with-only indicators** *(recommended)* — pros: both contingent fixes keep `lib/name.sh` untouched, so neither is prejudged / cons: a blocker and a deferral score the same
2. **Score only `arrival-guard-ran-red`** — pros: neutral / cons: the score says nothing
3. **Score the clause as written: a GREEN for the `GUARD` and no blocker** — pros: matches line 1 literally / cons: scores an edit of another part's file as a pass, baking in the reading under test

## Decision

Adopted-as-recommended (no user judgment): option 1. The Scope line binds without condition.

## Consequences

- The verdict is a per-run class (E, B, D, S, T, X) from a hand read; the mean score is a summary.
- As in the reference case, Δ is not evidence: the bare arm has no part-implementer.
