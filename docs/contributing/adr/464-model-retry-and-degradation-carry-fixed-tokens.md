---
subjects:
  - skills/run/SKILL.md
  - docs/contributing/specs/run-record.md
---
# 464 — Model retry and degradation carry fixed tokens

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/transient-model-retry.md · **Supersedes/Refines:** none

## Context

A degradation was recorded as free prose, so no grep finds it across ledgers; the new retry needs a
record line too.

## Options considered

1. **Two prose-family tokens** *(recommended)* — `MODEL-RETRY(<role>): <tier> overload` and
   `MODEL-DEGRADED(<tier>): fallback=<tier> cause=<overload|unavailable>` — pros: greppable, no engine change
2. **Same tokens parsed by run-state** — cons: no consumer reads them; dead parsing code
3. **Free prose** — cons: not greppable

## Decision

Option 1 — **adopted-as-recommended (no user judgment)**: it follows the house convention of fixed,
greppable run-record tokens (`INTENTION-*`, `STUB-*`, `DECISION-REVERSAL`). Both tokens join the
walk's token list in SKILL.md and the prose-only family in `specs/run-record.md`; `run-state` does
not parse them.

## Consequences

- A future consumer (rebuild, metrics) can parse them by adding them to the Token-vocabulary table.
