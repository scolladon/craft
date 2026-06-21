# 097 — Numeric convergence stop rule is a non-LOW finding count

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P18-walk-parallelism-enforcement.md · **Supersedes/Refines:** refines ADR-030 (convergence knob)

## Context

`validateHarness` already accepts a numeric `convergence: <n>` (`Number.isFinite(c) && c >= 0`),
but the stop rule it expresses was left undefined to the walk: "stop when remaining findings
≤ n" never said *which* findings count — raw total, or weighted by severity. P18 must make
this precise so the `reviewPlan.stop_rule` (ADR-096) names a single, mechanical rule.

## Options considered

1. **Count of remaining non-LOW findings ≤ n** *(chosen)* — stop when ≤ n findings of severity
   MEDIUM-or-higher remain, counted off the engine-normalized `Finding[]`. Pros: composes with
   the `low-only` sibling (LOW is never what a numeric threshold gates); `convergence: 0` means
   "stop only when zero actionable findings remain"; denominator is engine-defined. Cons: LOW
   findings are intentionally not counted (must be understood).
2. **Count of all remaining findings ≤ n (incl. LOW)** — pros: simplest statement. Cons: LOW
   noise can block convergence, contradicting `low-only`.
3. **Severity-weighted score ≤ n** (CRIT=4/HIGH=3/MED=2/LOW=1) — pros: most expressive. Cons:
   introduces a weighting table the validator does not model and nobody requested (YAGNI).

## Decision

Numeric `convergence: <n>` stops the review convergence loop when the count of remaining
findings with severity **≥ MEDIUM (non-LOW)** is **≤ n**, counted off the canonical
`Finding[]` produced by `engine/bin/normalize-findings.js`. `convergence: 0` ⇒ stop only when
zero non-LOW findings remain. LOW findings never block convergence. This is the rule the
named `reviewPlan.stop_rule` encodes for the numeric case; `low-only` and `none` keep their
existing meanings.

## Consequences

- `skills/review/SKILL.md` step 4 states this rule without the "walk judgment" hedge.
- The stop predicate reads off the normalized array the engine already produces — mechanical,
  no reviewer-prose interpretation.
- A repo wanting LOW-inclusive or weighted stopping is out of scope (Out of scope in the
  design); it would need a new knob under ADR-030 forward-compat.
