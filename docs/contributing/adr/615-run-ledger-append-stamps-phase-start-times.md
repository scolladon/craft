---
subjects:
  - scripts/run-ledger.sh
  - skills/run/SKILL.md
  - docs/contributing/specs/run-record.md
---
# 615 — `run-ledger.sh append` stamps the time of `PHASE-START` records only

- **Status:** accepted
- **Date:** 2026-10-17
- **Design:** docs/contributing/design/ledger-stamps-own-timestamps.md · **Supersedes/Refines:** refines ADR-380

## Context

`PHASE-START(<phase>): <iso8601>` is the only run-record token that carries a time, and the orchestrator wrote that time into the text. In past runs, late-phase times were round minutes later than the events they mark: `PHASE-START(propose): 15:10:00Z` after the PR merged at 14:39:24Z. `run-state`'s `inFlight[].since` and `emit-metrics --since` both read that time. Every ledger reader splits a line as `<run-id> <phase> <record>`: `run-state`'s `LINE_RE`, and the steer and reorient hooks' awk on `$1` and `$3`. Probed: a line with an extra stamp field is dropped silently by both.

## Options considered

1. **Fill the time of `PHASE-START` records only; the line shape stays `<run-id> <phase> <record>`** *(recommended)* — pros: no reader, regex or fixture changes; old and new lines mix in a ledger that was open before the change / cons: the other tokens stay untimed.
2. **Stamp every line in a third field, `<run-id> <phase> <iso> <record>`** — cons: every reader and fixture changes, with a fallback for old lines; a reader that is missed drops lines silently.
3. **Stamp every line in the first field, `<iso> <run-id> <phase> <record>`** — cons: as option 2, and it also breaks the run-id match in `$1`.

## Decision

The user ratified option 1. `append` recognises a record matching `^(PHASE-START\([a-z][a-z0-9-]*\):)( .*)?$` and writes it as the token followed by one space and the script's own UTC time (`date -u +%Y-%m-%dT%H:%M:%SZ`), taken when the line is written. Every other record is written byte for byte as before. The orchestrator appends `PHASE-START(<phase.id>):` with no time.

## Consequences

- `skills/run/SKILL.md` walk step 4 and §Done, and the run-record spec's `PHASE-START` row, name `append` as the writer of the time.
- Refines ADR-380: `append` no longer writes every record verbatim; it rewrites the time of a `PHASE-START` record.
- No production clock override exists (an env var or flag), because the orchestrator could set one and bring back model-written times.
