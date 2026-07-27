# 144 — Auto-skip eligibility is non-floor ∧ strand-clean ∧ not-required

- **Status:** accepted
- **Date:** 2026-06-23
- **Design:** docs/DESIGN-P26-auto-skip-unnecessary-phases.md · **Supersedes/Refines:** none

## Context

Eligibility must name the phases that *may* be auto-skipped. The designer recommended a
conservative archetype allowlist `{review, documentation, validation, architecture}` plus a
categorical "code-producing phases are never eligible" rule that excluded `refactoring`. The
user widened the set and rejected the code-producing rule: `refactoring` is the inverse of a
producer (it *re-produces* `change`, for which `implementation` is an earlier alternative
producer), so it is strand-clean, and the brief explicitly frames P26 as generalising the P19
no-op for `decisions`/`refactoring`.

## Options considered

1. **Archetype allowlist + code-producing categorical exclusion** *(designer recommendation)* — eligible set `{review, documentation, validation, architecture}`; any `change ∈ produces` excluded. Cons: the code-producing proxy is too broad — it excludes the strand-clean re-producer `refactoring`; needs a hand-maintained allowlist that duplicates what floor+strand already encode.
2. **Eligibility = non-floor ∧ strand-clean ∧ ¬required** *(user choice)* — drop the code-producing categorical and the archetype allowlist; a phase is eligible iff it is not one of the four floor phases, auto-skipping it does not strand a live consumer (`checkStrandedConsumers`), and it is not `required:`. Pros: the eligible set falls out naturally as `{decisions, review, refactoring, validation, documentation}` (+ `architecture` when enabled) — `design` and `planning` self-exclude via strand; no separate allowlist to drift. Cons: relies on the strand guard being correct (it is the same guard that gates `pipeline.skip`).
3. **Broad — also `planning`** — Cons: `planning` strands `implementation`, refused by the strand guard anyway. (`decisions` is *not* in this rejected bucket: it is strand-clean because `planning` self-supplies `decisions`, so it lands in the eligible set under rule (2) — see Decision.)

## Decision

*User choice (widened from the recommendation).* A phase is `autoSkipEligible` iff **all** hold:
it is **not a floor phase** (`workspace`, `implementation`, `propose`, `integrate` — categorical,
in code), it is **not `required: true`** (ADR-145), and **`checkStrandedConsumers(defaults,
{id}, effective) === []`** (the same guard that gates `pipeline.skip`). The code-producing
categorical and the archetype allowlist are **dropped**. Over the default pipeline this yields
exactly `{decisions, review, refactoring, validation, documentation}` (+ `architecture` when
enabled); `design` and `planning` self-exclude because removing them strands a consumer.
`decisions` **is** eligible — its only consumer `planning` carries `decisions` in `self_supply`,
so the strand guard skips it (this corrects the original design truth table, which mistakenly
listed `decisions` as stranded — an implementation finding folded back here).

## Consequences

- `refactoring` becomes eligible (strand-clean re-producer); `implementation` stays ineligible
  because it is a floor **and** strands every `change` consumer.
- No archetype allowlist to maintain — eligibility is "floor + strand + required", three facts
  the resolver already has.
- The strand guard is now load-bearing for two features (operator skip and auto-skip); it gains
  no new logic, only a second caller. This is the explicit DRY reuse the brief's R4 asks for.
