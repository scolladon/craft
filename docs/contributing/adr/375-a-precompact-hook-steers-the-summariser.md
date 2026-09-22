---
subjects:
  - hooks/hooks.json
---
# 375 — A PreCompact hook steers the summariser for the active run

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** none

## Context

The spike proved that `PreCompact` exit-0 stdout is appended to the summariser's instructions, in
sub-agent compactions too. The reorient hook re-injects the ledger after the summary is written,
and that re-injection already scored 6/6 exact on the spike's fact set. The question is whether to
also shape the summary itself.

## Options considered

1. **Not now; add it only if a live compaction shows drift** *(designer's recommendation)* —
   pros: YAGNI; one hook fewer / cons: the summary itself stays unsteered.
2. **Add it now** — pros: the summary keeps the run-id, ledger path, in-flight phase and landed
   commit hashes, so the orchestrator is oriented even before it reads the reorient block, and a
   sub-agent's summary keeps its task and landed commits / cons: a second hook script and its tests.

## Decision

Ratified by the user **against the design's recommendation**: option 2. craft ships a `PreCompact`
hook alongside the reorient hook. It follows the same rules: the same active-run binding (ADR-377),
the same silent no-op when no run is bound, bounded output, and no file written. Its text first
addresses the orchestrator's conversation (keep the run-id, ledger path, in-flight phase(s) and
landed commit hashes), then a craft sub-agent's conversation (keep the spawn task statement, the
files written and the commits landed).

## Consequences

- The design folds this in through a revision before planning, covering the script, its
  registration, its text and its tests.
- Two hooks now read the binding, which strengthens the case for one shared locate surface
  (ADR-380).
