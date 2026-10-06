---
subjects:
  - docs/contributing/maintainer-smokes.md
---
# 392 — Eval budgets derive from the pilot cost

- **Status:** accepted
- **Date:** 2026-10-06
- **Design:** docs/contributing/design/plugin-eval-suite.md · **Supersedes/Refines:** none

## Context

Each case spawns full `claude` child sessions, twice per run under ablation, on the maintainer's subscription rate limit. No cost figure exists before a paid pilot, and model prices move.

## Options considered

1. **`--runs 3` for full and sweep runs, `--runs 1` only to pilot a case; ceiling = pilot `costUsd` × runs × 1.5; the very first pilot capped at USD 5** *(recommended)* — pros: grounded in the CLI's own cost figure / cons: needs a pilot before the first full run
2. **One fixed documented ceiling (USD 20)** — pros: simple / cons: a guess that ages
3. **No ceiling** — pros: nothing to compute / cons: 48 child sessions unbounded

## Decision

Ratified by the user: option 1. Every documented command carries `--max-cost-usd`. Full and sweep runs use the CLI default of 3 runs; `--runs 1` is reserved for piloting a new or edited case.

## Consequences

- The procedure tells the maintainer where to read `costUsd` (top level of `aggregate-result.json`).
- A ceiling hit exits 2 with partial results; the procedure says to re-pilot rather than raise the cap blindly.
