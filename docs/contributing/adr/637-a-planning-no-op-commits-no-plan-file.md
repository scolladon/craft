---
subjects:
  - skills/planning/SKILL.md
  - engine/src/plan-lint-main.js
---
# 637 — A planning no-op commits no plan file; plan-lint keeps refusing zero parts

- **Status:** accepted
- **Date:** 2026-10-18
- **Design:** docs/contributing/design/planning-no-op-outcome.md · **Supersedes/Refines:** none

## Context

With a planning no-op declared (ADR-636), something must stand as the phase's outcome. `engine/src/plan-lint-main.js` `main()` exits 2 on a file with no `## Part` section, and a test pins that verdict. The README counts the files in `docs/contributing/plan/` as "parted plans".

## Options considered

1. **No plan file** *(recommended)* — planning commits nothing; the `NO-OP(planning):` ledger line is the outcome; plan-lint is not run — pros: plan-lint's verdict is untouched; matches the precedent run; costs one Preamble branch in implementation / cons: the outcome lives in the run record and PR body, not in a committed plan.
2. **Zero-part plan file** — plan-lint accepts a declared no-parts marker and planning commits the file — cons: changes `main()`; a planner that forgot its parts passes by emitting the marker; makes the README "parted plans" count false.

## Decision

The user ratified option 1. A planning no-op commits no file under the plan directory. plan-lint is unchanged: a zero-part file stays red, and the existing zero-part test is the regression pin for this decision. The `NO-OP(planning):` line, carried into the PR body by the documentation phase, is the record.

## Consequences

- Implementation must accept "no plan" when the run record holds `NO-OP(planning):` (ADR-638).
- A no-op run adds nothing to the README plan count.
