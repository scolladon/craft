---
subjects:
  - agents/part-implementer.md
  - test/p10-structure.test.js
---
# 436 — The part-implementer body pins the `PLAN-MISMATCH` token prefix in CI

- **Status:** accepted
- **Date:** 2026-10-10
- **Design:** docs/contributing/design/haiku-arriving-guard-handback.md · **Supersedes/Refines:** refines ADR-434

## Context

No test reads `agents/part-implementer.md`. The `PLAN-MISMATCH` token is the part of ADR-434 the paid sweep measures, so a silent rename would void that evidence, and only another paid run would show it. ADR-424 pins the contract's `GUARD` clauses for the same reason.

## Options considered

1. **No pin** — pros: no test change / cons: the token is protected only by the paid sweep
2. **Pin the token prefix `PLAN-MISMATCH(<test title>):` in `test/p10-structure.test.js`** *(recommended)* — pros: a rename fails CI; the part gets a RED / cons: one more structural test
3. **Pin the whole line, payload included** — pros: freezes the wording / cons: no exact-match grader reads the payload, so it would block ordinary rewording

## Decision

Adopted-as-recommended (no user judgment): option 2, aligned with ADR-424's pin-what-the-paid-eval-measures precedent. `test/p10-structure.test.js` asserts the part-implementer body contains `PLAN-MISMATCH(<test title>):`.

## Consequences

- Renaming the token needs the pin updated in the same change.
- The six adapter mirrors need no pin of their own: `sync-adapter-agents.sh --check` already fails on a stale mirror.
