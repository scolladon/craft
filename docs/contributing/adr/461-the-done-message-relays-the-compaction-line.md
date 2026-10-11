---
subjects:
  - skills/run/SKILL.md
---
# 461 — The Done message relays the compaction line

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/compaction-estimate-at-done.md · **Supersedes/Refines:** none

## Context

Tool output is collapsed by default, so a line only in emit-metrics' stdout is easy to miss.

## Options considered

1. **The final message repeats the line verbatim when printed** *(recommended)* — pros: the cost is seen without expanding tool output
2. **Tool output only** — cons: close to today's invisibility

## Decision

Option 1, ratified by the user.

## Consequences

- No line printed → nothing added to the final message.
