# 204 — Coverage gap in the documentation phase escalates via the blocker protocol

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/intention-port.md · **Refines:** ADR-200

## Context

The documentation phase gains a mechanical affected-page floor: affected pages =
(diff ∩ subjects) ∪ the existing LLM-judgment probe. When a changed scope is matched by
no living page (a coverage gap), something new may be owed — but `craft:docs-writer` is
update-only by its delivery contract; it cannot create pages.

## Options considered

1. **Escalate via the blocker protocol; docs-writer stays update-only** (recommended) —
   pros: smallest contract change; a human decides whether a new page is genuinely owed /
   cons: a run can pause for a judgment call.
2. **docs-writer gains template-based page creation** — pros: no pause / cons: amends
   the delivery contract and hands page-creation judgment to an agent.
3. **Record the gap advisorily only** — pros: never pauses / cons: a real coverage gap
   can ship unaddressed.

## Decision

A coverage gap surfaced in the documentation phase escalates through the standard
blocker protocol `{ unit, reason, ≤3 options }`. `craft:docs-writer` stays update-only;
the delivery contract is unchanged. **Adopted as recommended (no user judgment): the
smallest contract change, aligned with the delivery contract and the blocker protocol.**

## Consequences

New-page creation stays a human-gated decision. The advisory `INTENTION-DRIFT` path
(ADR-202) still records uncovered scopes in the run record for non-blocking visibility.
