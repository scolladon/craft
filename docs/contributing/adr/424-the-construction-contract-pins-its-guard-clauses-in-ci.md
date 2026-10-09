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

The maintainer chose option 3. `PHASE_EXPECTATIONS.construction` in `engine/test/contract-equivalence.test.js` carries "passes on its first run is confirmed passing for its stated reason", "fails on its first run is a RED: write its GREEN" and "not a blocker"; the first one holds the grader phrase. Because that marker check ignores case and the grader does not, a separate test asserts "confirmed passing for its stated reason" with its exact casing.

## Consequences

- Rewording any pinned clause of `contracts/construction.md` needs its marker updated in the same change. The pin grew from the two markers weighed here to three markers and a casing test when review scoped the confirmation to a passing `GUARD`.
- "report a RED/GREEN cycle", "deferred observation" and "no step breaks code to watch it fail" stay unpinned; only the paid sweep checks them.
