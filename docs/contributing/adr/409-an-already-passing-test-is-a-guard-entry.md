---
subjects:
  - agents/planner.md
  - templates/plan.md
---
# 409 — An already-passing test is a `GUARD` entry

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-08
- **Design:** docs/contributing/design/planner-red-label-audit.md · **Supersedes/Refines:** none

## Context

Plans need a label for a test that already passes at its step. Free prose ("regression guard, not a RED") produced "RED/guard" hybrids; 8 of the 10 kept plans already use the word "guard".

## Options considered

1. **A fixed token, `GUARD`** *(recommended)* — pros: greppable in a plan, easy for the model to recall / cons: a new word in the plan vocabulary
2. **Free prose** — pros: no new token / cons: what produced the hybrids
3. **A fixed token, `CHARACTERISATION`** — pros: a known term / cons: narrower meaning (legacy behaviour before a refactor)

## Decision

Adopted as recommended (option 1). A `GUARD` entry names the test and why it passes; it is never called RED or expected to fail.

## Consequences

- `GUARD` is a label inside a part, not a loop stage: the RED → GREEN → REFACTOR diagram in `docs/guides/concepts.md` is unchanged.
