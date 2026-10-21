---
subjects:
  - engine/src/findings.js
supersedes: []
---
# 671 — An over-range per-line line number throws a per-line message that echoes the line

- **Status:** accepted
- **Date:** 2026-10-21
- **Design:** docs/contributing/design/per-line-over-range-line.md · **Supersedes/Refines:** refines ADR-670 (per-line counterpart)

## Context

A per-line record's `\d+` line capture goes through `Number()`, which rounds past
`Number.MAX_SAFE_INTEGER` (`:99999999999999999999` exits 0 as `100000000000000000000`). The JSON
path already rejects such a value with a JSON-shaped message. The per-line path needs its own
error, and its two sibling errors (cap, no-match) both echo the truncated line.

## Options considered

1. **A per-line message that echoes the truncated line** *(recommended)* — pros: matches its
   per-line siblings, names the bound, points at the offending record / cons: a third per-line
   message string
2. **Reuse the JSON message** — pros: one string for one rule / cons: "index" and "as a number or
   a digit string" are JSON-shaped; no echo
3. **Reuse the no-match message** — pros: no new string / cons: misleading, the record matches
   the format

## Decision

User-ratified: option 1. A per-line record whose line number is not a safe integer throws
`Cannot parse findings: line number exceeds 9007199254740991: "<shown>"`, the bound spelled from
`Number.MAX_SAFE_INTEGER` and `<shown>` the same 120-character truncation the cap and no-match
errors echo.

## Consequences

No per-line line number is rounded into a wrong value. The JSON message (ADR-670) is unchanged.
