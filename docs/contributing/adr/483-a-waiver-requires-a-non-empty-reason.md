---
subjects:
  - engine/src/hygiene-lint-core.js
---
# 483 — A waiver requires a non-empty reason

- **Status:** accepted
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/waiver-mention-not-waiver.md · **Supersedes/Refines:** refines ADR-479

## Context

The documented shape is `TOKEN(<file>): <reason>`; a bare `TOKEN(<file>)` or an empty reason
could still be accepted.

## Options considered

1. **Reason required: `):` followed by at least one non-space character** *(recommended)* — pros: matches the documented shape; a near-miss fails closed; a CRLF `TOKEN(x):\r` line is inert with no special case / cons: none found
2. A colon alone is enough — cons: undocumented, lets an unexplained waiver through

## Decision

Option 1 — ratified by the user.

## Consequences

Every waiver in the diff and run record carries its justification.
