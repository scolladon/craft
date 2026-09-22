---
subjects:
  - skills/run/SKILL.md
  - docs/contributing/specs/run-record.md
---
# 379 — `PHASE-START` and `PHASE-DONE` tokens record phase state in the ledger

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** none

## Context

A rebuild after compaction must know which phases are complete. `GATE(...)`, `NO-OP(...)` and
`auto-skip:` cannot tell it: five default phases have an empty gate and never emit `GATE`, and a
gated phase can log red before green. The phase-entry time that `emit-metrics --since` needs was also
held only in session.

## Options considered

1. **`PHASE-START(<phase>): <iso8601>` at walk step 4 and `PHASE-DONE(<phase>): <outcome>` at walk
   step 7** *(recommended)* — pros: distinguishes in-flight from not-started; persists the `--since`
   instant / cons: two lines per phase.
2. **`PHASE-DONE` only** — cons: an in-flight phase is indistinguishable from one never started.
3. **No token; infer from artifacts and the existing tokens** — cons: brittle for gate-less phases.

## Decision

Adopted-as-recommended (no user judgment): it aligns with the fixed greppable-token convention of the
run-record vocabulary, and the alternatives leave gate-less phases underivable. For each phase, the
last of `PHASE-START`/`PHASE-DONE` wins, so a re-run phase goes back in flight.

## Consequences

- Rebuild derivation is code (`run-state`), not prose judgment.
- `Done` takes `--since` from the phase's `PHASE-START` line.
