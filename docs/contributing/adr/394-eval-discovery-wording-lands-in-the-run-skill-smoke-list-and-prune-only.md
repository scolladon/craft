---
subjects:
  - skills/run/SKILL.md
  - skills/prune/SKILL.md
---
# 394 — Eval discovery wording lands in the run skill's smoke list and prune only

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

Prune and prompt-surface audits should consult behavioural evidence before removing a prompt unit, as advice and not a gate. `skills/integrate` and `skills/metrics` execute in every user's repo, while `evals/` exists only in craft. The run skill enumerates the maintainer smokes in full.

## Options considered

1. **Add the eval suite to the run skill's smoke list and an advisory paragraph to prune; nothing in integrate or metrics** *(recommended)* — pros: the enumeration stays true, no craft-self leak / cons: touches two skills
2. **Also a line beside integrate's baseline-refresh offer** — pros: closer to prompt edits / cons: leaks craft-self specifics into a generic prompt
3. **Leave the run skill untouched** — pros: smaller diff / cons: its smoke enumeration becomes false

## Decision

**adopted-as-recommended (no user judgment).** Option 1. `skills/prune/SKILL.md` gains one advisory paragraph in "Enacting an approved prune" (no new token, no new `*-CANDIDATE(` form); `skills/run/SKILL.md`'s maintainer-smoke list names the behavioural eval suite. Integrate and metrics are unchanged.

## Consequences

- The prompt surface is edited, so integrate offers the metrics baseline refresh as its own reviewed step.
