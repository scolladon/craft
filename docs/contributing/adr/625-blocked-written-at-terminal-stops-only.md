---
subjects:
  - skills/run/SKILL.md
---
# 625 — BLOCKED is written only at a terminal stop; escalations are asked first

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

The spike proved an ask reaches the person through `claude attach` and the driver's notification. The blocker protocol (`{ phase, reason, ≤3 options }`) already exists.

## Options considered

1. **Terminal stops only: STOPs, a declined or unresolvable escalation, a `degrade-to-blocker` policy surface** *(recommended)*
2. **Every blocker writes `BLOCKED` at once** — cons: every recoverable blocker becomes a restart
3. **STOPs only** — cons: an escalation the person cannot resolve hangs the run

## Decision

**adopted-as-recommended (no user judgment)** — option 1. One blocker protocol for attended and driven runs. A driven run still asks; only a stop it cannot continue from writes `BLOCKED`.

## Consequences

- None beyond the decision.
