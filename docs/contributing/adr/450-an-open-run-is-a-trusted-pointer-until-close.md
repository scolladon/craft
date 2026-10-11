---
subjects:
  - scripts/run-ledger.sh
  - skills/run/SKILL.md
  - docs/contributing/specs/run-record.md
---
# 450 — An open run is a trusted pointer until close

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/refuse-open-on-live-run-id.md · **Supersedes/Refines:** none

## Context

`run-ledger.sh open` on a run-id whose run is still live replaces that run's ledger with a fresh one; only one stderr line warns. Refusing needs a signal that tells a live run from a crashed one. Measured on this box: the script's parent shell dies after every tool call, and the first stable ancestor is the harness process at a depth that depends on the wrapping.

## Options considered

1. **Refuse-unless-closed** *(recommended)* — a run is open from `open` to `close`; `open` refuses an open run-id and the user judges a crash / pros: no new state, the only error (refusing a crashed run) costs one STOP and is recoverable / cons: a crashed run needs an explicit discard
2. **pid in the pointer + `kill -0`** — pros: automatic / cons: no stable pid exists at a fixed depth; a resumed session would read as dead
3. **Worktree/branch existence** — pros: reuses existing state / cons: reads a live run as dead before `workspace` and between teardown and `close`; misses `in-place`; the branch type is unknown at §0

## Decision

Option 1, ratified by the user. The pointer is the liveness signal; whether an open run is dead is the user's call, never the script's.

## Consequences

- A false refusal (crashed run) costs one STOP; a false accept (live run discarded) can no longer happen through `open`.
- No pid, lock or heartbeat state is added to the pointer.
