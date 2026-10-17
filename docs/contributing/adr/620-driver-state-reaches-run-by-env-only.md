---
subjects:
  - skills/run/SKILL.md
  - engine/src/driver-state.js
---
# 620 — The driver state dir reaches the run through the environment only, no craft flag

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

A `claude --bg` session is handed to a supervisor, so whether the launcher's environment reaches the session was unproven. Probe P1 (2026-10-17, CLI 2.1.302, haiku, `--bg`): `CRAFT_DRIVER_STATE` set on the launcher was read back by `printenv` inside the session. The `--resume` path was not probed.

## Options considered

1. **Environment variable only** *(recommended; P1 passed)* — pros: the prompt stays clean and cannot be pasted forward / cons: a driver must re-set it on `--resume`
2. **A `--driver-state <dir>` craft flag** — cons: one more flag the election must strip; rides the prompt
3. **Both, flag wins** — cons: two sources of truth

## Decision

**adopted-as-recommended (no user judgment)** — option 1. Craft reads the state dir from `CRAFT_DRIVER_STATE` at each use and holds nothing in session state, so compaction and resume lose nothing. No craft flag exists for it.

## Consequences

- The driver spec states: set the variable again on `claude --bg --resume`.
