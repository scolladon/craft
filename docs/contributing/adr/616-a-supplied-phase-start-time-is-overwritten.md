---
subjects:
  - scripts/run-ledger.sh
---
# 616 — A `PHASE-START` time supplied by the caller is overwritten, with a stderr note

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/ledger-stamps-own-timestamps.md · **Supersedes/Refines:** none

## Context

Under ADR-615, `append` owns the time of a `PHASE-START` record. An orchestrator still following the old walk-step-4 wording (after a plugin update mid-run, or from habit) will still send `PHASE-START(<id>): <iso>`.

## Options considered

1. **Overwrite: drop everything after the token, stamp, exit 0, print one stderr note** *(recommended)* — pros: the time is always the script's; a stale caller keeps working; the note keeps the replacement visible / cons: the supplied value is lost.
2. **Reject with exit 2 and write nothing from that call** — cons: stdin must be read in full and checked before any write; every stale phase entry becomes a blocker.
3. **Keep both, `<script-iso> claimed=<supplied>`** — cons: changes `PHASE_START_RE` and the spec regex to keep a value already shown to be unreliable.

## Decision

The user ratified option 1. When a `PHASE-START` record has anything after the token, `append` replaces it with its own time. When that tail holds more than spaces, it also writes `run-ledger: append: replaced a supplied PHASE-START time` to stderr. The exit status stays 0. A record like `PHASE-START(design):x`, with no space after the colon, does not match the token form and is written verbatim, as today.

## Consequences

- An old and a new orchestrator write the same line.
- The stderr note is the only trace of a supplied time. Nothing in the ledger keeps it.
