---
subjects:
  - skills/decisions/SKILL.md
supersedes:
  - adr: "100"
    scope: "the escalate-when conditions and the when-in-doubt default"
---
# 433 — `decisions` escalates every candidate the adopt rule does not admit

- **Status:** accepted
- **Date:** 2026-10-10
- **Design:** none (harness prune review) · **Supersedes/Refines:** supersedes ADR-100 (escalation wording only)

## Context

ADR-100 made the decisions phase adopt a recommendation only when it is clear and aligns with an
ADR or stated principle, and it spelled out when to escalate: an unclear recommendation, a real
user-judgment trade-off, a deviation, and "when in doubt, escalate". The `decisions-escalates-fork`
eval, with its fixture hint removed, scores bare 1.00 / Δ 0.00 over three runs (2026-10-09): the
model without craft escalates the fork on its own. The escalation wording adds nothing measurable
on top of the adopt rule.

## Options considered

1. **Cut the escalation wording; escalate whatever the adopt rule does not admit**
   *(recommended)* — pros: drops prose the model no longer needs; the adopt rule stays the one
   threshold / cons: a clear, aligned recommendation over a real user trade-off is no longer named
   as a fork, and no fixture exercises that case.
2. **Keep the wording** — pros: no change / cons: keeps guidance the eval shows is unused.

## Decision

Ratified by the user: option 1. A candidate is adopted only when its recommendation is clear and
aligns with an existing ADR or stated craft principle; any other candidate is a genuine fork and is
escalated.

Superseded from ADR-100: the listed escalation conditions (unclear recommendation, real
user-judgment trade-off, deviation from an ADR or principle) and the "when in doubt, escalate"
default, as skill wording.

Carried forward from ADR-100: the adopt threshold (clear AND aligned with an ADR or stated
principle), escalation of everything else, and "aligned" as a session judgment.

## Consequences

- The skill states one threshold; escalation is its complement.
- The no-op path and its `decisions-noop-when-clear` case are unchanged.
- The clear-and-aligned-but-trade-off case has no eval; a regression there would go unmeasured.
