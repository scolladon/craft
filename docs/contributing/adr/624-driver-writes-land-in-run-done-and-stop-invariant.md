---
subjects:
  - skills/run/SKILL.md
---
# 624 — FINISHED lands in run §Done after close; BLOCKED lands through a cross-phase stop invariant

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/driver-contract-in-craft-run.md · **Supersedes/Refines:** none

## Context

The driver starts the next entry as soon as it reads a status. Anything the run writes after that races the next entry.

## Options considered

1. **§Done after `run-ledger.sh close` for `FINISHED` + election; a new cross-phase invariant for `BLOCKED` at every terminal stop** *(recommended)*
2. **`craft:integrate` final summary** — cons: runs before memory save, emit-metrics and close
3. **A Stop hook deriving the status from the ledger** — cons: Stop is not idle; `close` deletes the ledger before a hook could read the PR URL

## Decision

The user ratified option 1. The status write is the run's last tool call. In §Done it follows `run-ledger.sh close`, which becomes the last ledger action. At a terminal stop the last tool call writes `BLOCKED <phase-id>: <reason>`; §0 stops use phase id `resolve`.

## Consequences

- Nothing follows the status write but the final message.
