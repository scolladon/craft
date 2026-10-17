---
subjects:
  - engine/src/driver-state.js
  - engine/src/driver-state-main.js
  - engine/bin/driver-state.js
  - scripts/driver-state.sh
---
# 628 — The driver-state contract is an engine module with a bin and a scripts wrapper

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

The strip is a small tokeniser and the status needs a grammar and atomic writes. Prose alone is what leaked in the spike.

## Options considered

1. **Pure engine module + `-main.js` + bin + thin `scripts/` wrapper (the emit-metrics pattern)** *(recommended)* — pros: table tests, a generated-corpus idempotence test and Stryker
2. **A bash script with node:test** — cons: tokenising in bash
3. **Prose only** — cons: what leaked

## Decision

**adopted-as-recommended (no user judgment)** — option 1. Run-skill prose only calls `scripts/driver-state.sh` (`active`, `finished`, `blocked`); the module owns the grammar and the strip; the main owns argv, env and atomic writes.

## Consequences

- None beyond the decision.
