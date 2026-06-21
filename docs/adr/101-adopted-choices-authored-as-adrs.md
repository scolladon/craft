# 101 — Adopted-without-escalation choices are still authored as ADRs, marked adopted-as-recommended

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P19-noop-first-class-phase-outcome.md · **Supersedes/Refines:** none

## Context

Given the adopt-without-escalation path (ADR-100), a choice the session adopts without consulting the
user can be recorded two ways: lightly (a run-record line only) or as a full ADR. An ADR conventionally
records a *user judgment*, of which an adopted choice has none — so the lighter option is tempting. The
decision governs the decisions-phase wording and the ADR log's completeness.

## Options considered

1. **Lightly, no ADR** — adopted choices appear only as the run-record no-op line naming the adopted
   recommendation + the aligning ADR/principle; ADRs are authored only for escalated forks.
   *(designer's recommendation)* — pros: keeps the ADR log free of ceremony / cons: the decision trail
   for adopted choices lives only in the run record.
2. **Always ADR per adopted choice** — author an ADR for each adopted choice too, marked
   "adopted-as-recommended, no user judgment". *(user's choice)* — pros: a complete, greppable decision
   trail regardless of escalation / cons: more ADR volume per run.
3. **One batch summary ADR** — a single ADR listing all adopted choices — cons: unclear cross-link
   semantics.

## Decision

Every adopted-without-escalation choice is **authored as its own ADR** from the template, with its
Decision section marked **adopted-as-recommended (no user judgment)** to distinguish it from a ratified
(escalated-and-decided) choice. The decisions skill authors ADRs for **settled** choices — ratified
*and* adopted — not only ratified ones.

## Consequences

- The ADR log is the complete decision trail; an adopted choice is auditable as an ADR, not only a
  run-record line.
- The decisions skill's "author each ratified decision" step widens to "each settled decision";
  adopted ADRs carry the adopted-as-recommended marker so the log stays distinguishable.
- The scope-fold rule still fires only on a *deviation* from the design's recommendation — an adopted
  choice takes the recommendation as written, so it never trips the fold.
- More ADRs per run than the lighter option, accepted in exchange for auditability.
