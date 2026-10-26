---
subjects:
  - engine/src/guards/shell-tokeniser.js
  - BACKLOG.md
supersedes: []
---
# 696 — An arithmetic read of a variable gets no data-flow rule

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-26
- **Design:** docs/contributing/design/guard-arith-cleanup.md · **Supersedes/Refines:** relies on ADR-695

## Context

`x='a[$(git push -f origin)]'; echo $(( x ))` runs git under /bin/bash 3.2.57 and 5.3.20 (design
row 57). The substitution reaches the arithmetic context only through a variable value. The brief
required the false-block cost of a data-flow rule as measured numbers.

## Options considered

1. **No data-flow rule; ADR-695's word rule covers the literal** *(recommended)* — pros: blocks rows
   57 and 94–100 at ADR-695's cost (0 / 29162 fuzz, 1 / 244 disk) with no sink list; the residual
   (rows 101, 102, values set by an earlier call) is closed as won't-do
2. **Bounded data-flow rule** — a variable assigned a quoted `[`…opener string, then read in an
   arithmetic sink in the same line — cons: 0 / 11026 fuzz and 0 / 210 disk newly blocked, but it
   re-enumerates sink positions (lesson 007) and misses rows 95 (escape spelling) and 96–102
3. **Won't-do for row 57 as a whole** — cons: leaves rows 57 and 94–100 open

## Decision

Ratified by the user: option 1. No data-flow rule is built. The residual is recorded under
`### Closed — won't-do (rationale recorded)` in BACKLOG.md with rows 101 and 102.

## Consequences

A value the command text never holds whole in one word (`printf -v`, concatenation, a file, an
environment variable or argument set by an earlier call) stays open. Closing it needs a refusal of
every arithmetic variable read, which denies 34 of 210 allowed disk scripts (16%).
