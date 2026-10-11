---
subjects:
  - engine/src/observability/metrics-emit-main.js
  - engine/src/observability/usage-aggregate.js
---
# 455 — emit-metrics prints the compaction estimate line

- **Status:** accepted — ratified by the user
- **Date:** 2026-10-11
- **Design:** docs/contributing/design/compaction-estimate-at-done.md · **Supersedes/Refines:** refines ADR-382 (option 3)

## Context

The miner reports `compactionEstimate` per run (ADR-382), but nothing surfaces it at a run's `Done`. emit-metrics reads only sub-agent transcripts, so the orchestrator's own compactions never reach it.

## Options considered

1. **The emit-metrics bin prints it** *(recommended)* — pros: unit-tested; reuses the discovery and stream path emit-metrics owns; the sub-agent half is already parsed / cons: emit-metrics must also read the session's main transcript
2. **The `Done` prose runs the miner and greps the line** — pros: no engine change / cons: the miner has no `--session`, re-parses every session in the project dir, writes report files into the repo root; untested
3. **A separate compaction bin** — pros: testable / cons: a third composition root and a second discovery wiring for one line

## Decision

Option 1, ratified by the user. The line goes to stdout only; rows, totals, drift and baselines stay unchanged (ADR-382, ADR-369).

## Consequences

- emit-metrics reads the session's main transcript for compactions only; its events are discarded, so rows stay byte-identical.
