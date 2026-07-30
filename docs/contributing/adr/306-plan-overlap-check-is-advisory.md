# 306 — The plan overlap check is advisory, never blocking

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** none

## Context

Two plan parts naming the same files cost twice: two implementers rebuild the same mental
model, and the later part's pre-chewed context goes stale from the earlier part's edits. But
overlap is sometimes correct — this repo has shipped a plan where two parts deliberately
edited the same script's counters, and that plan was right.

## Options considered

1. **Advisory: warning to stdout, exit code unchanged** *(recommended)* — pros: surfaces the cost without failing correct plans / cons: a warning can be ignored.
2. **Blocking: exit non-zero unless each overlapping part carries a justification line** — pros: forces the merge-or-explain conversation / cons: would have failed a correct shipped plan; pressures authors toward under-partitioning.
3. **Advisory by default with an opt-in strict flag** — pros: both postures / cons: a flag with no consumer — the manifest has no knob to set it from.

## Decision

**Ratified by the user, as recommended.** Overlapping parts produce a warning on stdout; the
lint's exit code is unchanged. Overlap is treated as a cost and a risk to be seen, not a
defect to be blocked.

## Consequences

The planning gate string and its pass/fail behaviour are unchanged, so nothing downstream
re-tunes. The warning's value depends on someone reading it — if it is ever ignored in
practice, the follow-up is to revisit the posture, not to add a flag.
