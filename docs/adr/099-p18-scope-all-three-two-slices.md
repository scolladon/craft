# 099 — P18 scope: all three items, two parts

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P18-walk-parallelism-enforcement.md · **Supersedes/Refines:** discharges ADR-064; depends on ADR-096, ADR-097, ADR-098

## Context

P18 lists three items; item 3 (the `--harness` flag) is preconditioned on items 1+2
(`passes`/numeric `convergence`) being engine-enforced. The scope question is whether this
change delivers all three and in what order.

## Options considered

1. **All three in this change, two parts** *(chosen)* — Part 1 = Layer A; Part 2 = Layer B
   (`--harness`). Pros: ADR-064 names this exact pass; part order meets the precondition
   *within* the change. Cons: a larger single change.
2. **Items 1+2 only**, defer the flag — cons: leaves ADR-064 open with no new reason.
3. **Item 3 only**, treat 1+2 as already done — cons: wrong, the parked block still calls them
   advisory; the precondition is not actually met.

## Decision

Deliver **all three items** in two parts:

- **Part 1 — Layer A:** the engine emits `reviewPlan { passes, stop_rule }` on the resolved
  review descriptor (ADR-096), with the numeric `stop_rule` = non-LOW finding count (ADR-097);
  `skills/review/SKILL.md` reads `reviewPlan` and the parked-note block is removed. **Per
  ADR-096 this part carries engine code — it is not SKILL-only** (this supersedes the design's
  original "SKILL-only" framing of part 1, a consequence of choosing the review-plan field).
- **Part 2 — Layer B:** the `--harness` per-invocation overlay (ADR-098) — `parseArgs` branch +
  coercion, nested-write `applyCliOverlay`, re-validation in the resolve bin, orchestrator
  forwarding.

Part order (A before B) satisfies item 3's precondition: the flag overrides knobs that are
now engine-enforced.

## Consequences

- Discharges ADR-064 in the pass it was routed to.
- The planning phase produces (at least) these two parts, strict TDD each, A before B.
- BACKLOG.md P18 is ticked at the documentation phase with the ADR-064 follow-up marked closed.
