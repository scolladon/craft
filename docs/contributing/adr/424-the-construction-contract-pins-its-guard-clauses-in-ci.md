---
subjects:
  - contracts/construction.md
  - engine/test/contract-equivalence.test.js
---
# 424 — The construction contract pins its `GUARD` clauses in CI

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/arriving-guard-contract-rule.md · **Supersedes/Refines:** none

## Context

ADR-412's contract edit shipped with no structural test. The `implementer-runs-guards` case's `contract-delivered` grader matches the phrase "confirmed passing for its stated reason" in the spawn input, so rewording it breaks the grader silently, and only a paid run would show it. The evals stay out of CI (ADR-393), so no test may read `evals/`.

## Options considered

1. **No pin**, as ADR-412 shipped — pros: no test change / cons: both clauses are checked only by the paid sweep; the part has no RED
2. **Pin the new clause in `PHASE_EXPECTATIONS.construction`** — pros: guards the new rule / cons: the grader phrase stays unprotected
3. **Pin the new clause and "confirmed passing for its stated reason"** *(recommended)* — pros: a reword of either fails CI, without reading `evals/` / cons: two more markers to keep in step with the contract

## Decision

The maintainer chose option 3. `PHASE_EXPECTATIONS.construction` in `engine/test/contract-equivalence.test.js` carries "fails on its first run is a RED" and "confirmed passing for its stated reason".

## Consequences

- Rewording either clause of `contracts/construction.md` needs the marker updated in the same change.
