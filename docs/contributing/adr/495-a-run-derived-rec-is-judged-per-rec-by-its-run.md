---
subjects:
  - engine/src/observability/usage-aggregate.js
---
# 495 — A run-derived rec is judged per rec by its run

- **Status:** accepted
- **Date:** 2026-10-12
- **Design:** docs/contributing/design/baseline-review-waste-replay-guard.md · **Supersedes/Refines:** none

## Context

No committed run carries `phaseTurns`, so a run-derived kind can lack its input on some or all runs. A rec can also name a run absent from `runs`. The replay must decide what each case means without forcing a re-mine.

## Options considered

1. **Per rec** *(recommended)* — pros: kept verbatim when its run exists without the input key; dropped when its run is absent from `runs`; judges mixed reports run by run / cons: about four more lines
2. **Per kind** — pros: replay a kind only when every run carries its key / cons: orphan recs pass
3. **Fail** — pros: strict / cons: red today, and only the destructive re-mine turns it green

## Decision

Option 1 — ratified by the user. A run-derived rec whose run exists without the input key is kept verbatim. A run-derived rec whose run is absent from `runs` is dropped, so the guard fails on it. Runs that carry the key are rebuilt by the current rules.

## Consequences

Orphan recs are caught. A report mixing runs with and without `phaseTurns` is judged where the data allows.
