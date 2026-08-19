---
subjects:
  - engine/src/adr-lint-main.js
  - docs/contributing/specs/run-record.md
---
# 357 — `DECISION-CITE-WAIVE` is its own token

- **Status:** accepted
- **Date:** 2026-08-18
- **Design:** docs/contributing/design/decision-drift-propagation.md · **Supersedes/Refines:** none

## Context

A live-tier citation of a superseded ADR is sometimes correct — a document may quote the old
rule deliberately. The sweep needs a waiver, and the ledger has an established waiver family.

## Options considered

1. **A new fixed token `DECISION-CITE-WAIVE(<file>): <reason>`**, collected by the hygiene
   core's `collectWaived` — pros: matches `STUB-WAIVE`/`SLOP-WAIVE`/`INTENTION-WAIVE` exactly,
   reuses `collectWaived` unchanged / cons: one more token. *(designer's recommendation)*
2. **Reuse the generic `WAIVER:` token** — pros: no vocabulary growth / cons: `WAIVER:` is
   scoped to executing-harness skips and carries no `(<file>)` parameter, so a waiver cannot be
   attributed.
3. **An inline marker in the citing file** — pros: local / cons: scatters the decision across
   the swept files and needs its own lint to stay honest.

## Decision

Option 1, **ratified by the user** as part of accepting all three new tokens (14 total,
from 11). The waiver sources are the design doc and the PR body, exactly as they are for
`STUB-WAIVE` and `INTENTION-WAIVE`.

## Consequences

One `waiverPattern` constant; no change to `collectWaived`. `DECISION-CITE-FOUND(<file>):` is
**not** a run-record token — under the hard-blocking posture a finding stops `ci.sh` and there
is no run to fold it into, so it is the lint's stdout format only. Had the advisory posture been
chosen, the found-token would have had to join the vocabulary as a fourth addition.
