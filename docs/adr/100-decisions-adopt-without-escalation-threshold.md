# 100 — `decisions` adopts a recommendation without escalating only when clear and ADR/principle-aligned

- **Status:** accepted
- **Date:** 2026-06-21
- **Design:** docs/DESIGN-P19-noop-first-class-phase-outcome.md · **Supersedes/Refines:** none

## Context

The `decisions` phase is session-owned and is craft's human-in-the-loop gate. Before this change
it forced a per-candidate user conversation whenever design surfaced *any* candidate — even where the
recommendation was unambiguous and already aligned an existing ADR or stated principle. That is an
asymmetry with `refactoring`, whose honest no-op is already first-class. Introducing an
adopt-without-escalation path makes the **threshold** between "adopt" and "escalate" load-bearing,
because it sets how much the workflow decides autonomously versus deferring to the user.

## Options considered

1. **Clear-and-ADR-aligned** — adopt iff the recommendation is unambiguous AND aligns an existing
   ADR / stated craft principle; escalate when in doubt. *(designer's recommendation)* — pros: highest
   fidelity to the brief; default-to-escalate preserves user authority / cons: requires a judgment call
   on "aligned".
2. **Recommendation-exists** — adopt whenever any recommendation is stated — cons: rubber-stamps
   under-justified recommendations.
3. **Always-escalate (status quo)** — cons: the asymmetry this work removes.

## Decision

A candidate is **ADOPTED without escalation** only when its design recommendation is **unambiguous
AND aligns an existing ADR or stated craft principle**. Any candidate whose recommendation is unclear,
whose alternatives carry a real user-judgment trade-off, or that deviates from an existing ADR/principle
is a **GENUINE FORK** and is escalated to the user. **When in doubt, escalate** — adopt only the
unambiguous.

## Consequences

- `decisions` gains a triage step (adopt-or-escalate) ahead of the conversation; a run where every
  candidate is adopted reaches a recorded first-class no-op instead of a manufactured conversation.
- User authority over genuine forks is unchanged; the escalation default is conservative.
- "Aligned" is a session judgment, not a mechanical check — consistent with craft's prose-judgment
  precedents (e.g. file-id-form, ADR-060).
