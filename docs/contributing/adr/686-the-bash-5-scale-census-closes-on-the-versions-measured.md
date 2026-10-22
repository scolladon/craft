---
subjects:
  - BACKLOG.md
supersedes: []
---
# 686 — The bash 5 scale census closes on the versions measured

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-22
- **Design:** docs/contributing/design/bash53-heredoc-comsub-false-block.md · **Supersedes/Refines:** none

## Context

Only bash 3.2.57 and 5.3.20 are on this box; bash 5.0–5.2 cannot be measured.

## Options considered

1. **Close when every arm is green, recording 3.2.57 and 5.3.20 as measured** *(recommended)*
2. **Close, plus a trigger-only line to re-run on bash 5.0–5.2**
3. **Keep the entry open until a bash 5.0–5.2 box exists**

## Decision

Ratified by the user: option 1. The guard refusal of ADR-684 does not depend on the shell version.

## Consequences

If any arm is red, the entry stays open with its trigger narrowed to what failed.
