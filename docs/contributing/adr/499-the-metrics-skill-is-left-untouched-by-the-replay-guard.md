---
subjects:
  - skills/metrics/SKILL.md
---
# 499 — The metrics skill is left untouched by the replay guard

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/baseline-review-waste-replay-guard.md · **Supersedes/Refines:** none

## Context

The replay contract needs a home in the docs. Editing anything under `skills/` makes the integrate phase offer the drift-baseline refresh, which is the destructive re-mine.

## Options considered

1. **Telemetry spec section, BACKLOG flip and README count; `skills/metrics/SKILL.md` untouched** *(recommended)* — pros: no destructive refresh offer; a re-mined report agrees by construction
2. **The same, plus a step in `skills/metrics/SKILL.md`** — pros: operator-visible / cons: triggers the refresh offer

## Decision

Option 1 — **adopted-as-recommended (no user judgment).** The replay contract is documented in `docs/contributing/specs/telemetry.md`; `skills/metrics/SKILL.md` is not edited. Aligns with the scope rule: do exactly the request.

## Consequences

Operators learn of the replay from the spec and the guard's failure message, not from the metrics skill.
