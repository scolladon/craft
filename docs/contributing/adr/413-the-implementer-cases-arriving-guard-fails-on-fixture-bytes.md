---
subjects:
  - evals/implementer-runs-guards/fixture/**
---
# 413 — The implementer case's arriving GUARD fails on fixture bytes alone

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/implementer-guard-eval.md · **Supersedes/Refines:** none

## Context

The case needs a `GUARD` that fails on arrival in every run. A claim about the output of the RED's GREEN passes whenever the implementer's GREEN happens to deliver it, which fails two graders with no implementer defect.

## Options considered

1. **Step 1, before any GREEN, claims behaviour the fixture lacks (`${1-world}` with an empty name)** *(recommended)* — pros: the fixture bytes alone decide the failure / cons: the plan mismatch is about fixture state, not an earlier GREEN
2. **After the RED's GREEN, claim an output that GREEN produces** — pros: mirrors the planner story / cons: passes on arrival when the GREEN delivers it
3. **After the GREEN, a fixture-state claim unrelated to `--shout`** — pros: independent of the flag / cons: a GREEN that rewrites the name default flips it

## Decision

Adopted-as-recommended (no user judgment): option 1. The failing-on-arrival `GUARD` is plan step 1 and fails against the committed fixture before any code changes.

## Consequences

- A run that reorders steps so the GREEN fixes the default first makes the `GUARD` pass on arrival; the hand read classifies it.
