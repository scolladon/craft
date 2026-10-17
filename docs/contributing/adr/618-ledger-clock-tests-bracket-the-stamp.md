---
subjects:
  - test/run-ledger.test.js
---
# 618 — Ledger clock tests bracket the stamp between the call's start and end

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/ledger-stamps-own-timestamps.md · **Supersedes/Refines:** none

## Context

The time ADR-615 stamps comes from the script's own `date`, with no override (an override would let the orchestrator set the time). A test cannot inject the value.

## Options considered

1. **Bracket: check `before <= stamp <= after`, both truncated to the second, plus a format check** *(recommended)* — pros: no change to production code and no stub; a supplied time from another day (`2000-01-01…`) proves the overwrite / cons: a collision within the same second goes unseen.
2. **A fake `date` on PATH in the test** — cons: ties the tests to the script finding `date` through PATH.
3. **A clock override env var in `run-ledger.sh`** — cons: the orchestrator could set it, which brings back model-written times.

## Decision

The user ratified option 1. Tests read the time before and after the `append` call, in the same fixed-width `YYYY-MM-DDTHH:MM:SSZ` form, and check that the stamp falls between them, inclusive.

## Consequences

- No test hook exists in `run-ledger.sh`.
