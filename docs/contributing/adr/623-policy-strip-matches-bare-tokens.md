---
subjects:
  - engine/src/driver-state.js
---
# 623 — The --policy strip removes bare flag tokens only and refuses a prompt that still holds one

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

A backlog entry may discuss `--policy` in prose (this run's own entry does). Stripping every occurrence would mangle it.

## Options considered

1. **Bare whitespace-delimited tokens only (`--policy <v>`, `--policy=<v>`); quoted/backticked mentions kept; exit 3 if a bare token survives** *(recommended)*
2. **Every occurrence, quoted or not** — cons: mangles prose about policy flags
3. **Option 1 plus refuse any quoted mention** — cons: refuses every election that discusses `--policy`

## Decision

**adopted-as-recommended (no user judgment)** — option 1. Strip removes what §0 step 0a's grammar treats as a flag: a bare `--policy` and its following `=`-bearing value, or a single `--policy=…` token, on any line. Prose mentions stay. The strip is idempotent; a bare token left after it is a refusal (exit 3) and the run writes the status without an election.

## Consequences

- Residual risk, stated in the driver spec: an orchestrator could still read a quoted mention as a flag; the driver's outward guard stays the hard boundary.
