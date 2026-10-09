---
subjects:
  - evals/decisions-escalates-fork
  - docs/contributing/maintainer-smokes.md
---
# 427 — An escalates-fork Δ near zero is recorded as prune evidence

- **Status:** accepted
- **Date:** 2026-10-09
- **Design:** docs/contributing/design/harder-decisions-fork-fixture.md · **Supersedes/Refines:** none

## Context

With the uncovered-fork sentence gone (ADR-425), no fixture text tells the bare arm the fork is open. maintainer-smokes "Reading results" says a Δ near 0 with a high bare score "is the evidence a prune candidate needs". The case also carries the with-only `no-false-noop` grader, which guards against an unconditional `NO-OP(decisions):`.

## Options considered

1. **Prune evidence, keep the case** *(recommended)* — record a 3-run Δ near 0.00 with bare near 1.00 as prune evidence for the skill's escalation path, enact nothing here, keep the case for `no-false-noop` — pros: follows the suite's own reading rule / cons: none recorded
2. **Numbers only** — pros: makes no claim / cons: discards what the edit was made to measure
3. **Harden the fixture again** — pros: another chance at Δ > 0 / cons: only the trade-off itself is left to remove, and without it the candidate is no fork

## Decision

The maintainer chose option 1. The reading applies to the 3-run sweep only (ADR-426).

## Consequences

- The maintainer-smokes "What the Δ column says" sentence on this case and the BACKLOG entry carry the reading.
- Enacting a prune goes through `craft:prune`, outside this change.
