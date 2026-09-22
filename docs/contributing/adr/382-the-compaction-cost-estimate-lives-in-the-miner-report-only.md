---
subjects:
  - engine/src/observability/adapters/claude/telemetry.js
  - engine/src/observability/usage-aggregate.js
---
# 382 — The estimated compaction cost is reported by the miner only, never in totals

- **Status:** accepted
- **Date:** 2026-09-22
- **Design:** docs/contributing/design/auto-compaction-safety.md · **Supersedes/Refines:** none

## Context

The summarisation call's usage appears in no transcript and no hook payload. It can only be estimated
from each `compact_boundary` entry: cache read ≈ `preTokens`, input ≈ 3–5.5k, output ≈ 2× the
summary's tokens ±40%.

## Options considered

1. **In the miner report only, as `runs[*].compactionEstimate` labelled estimate** *(recommended)* —
   pros: what the acceptance names; measured totals stay measured / cons: not visible in the metrics
   ledger.
2. **Also a metrics-ledger column** — cons: breaks row comparability across the format boundary
   (ADR-369's rationale).
3. **Also one advisory line from `emit-metrics` at `Done`** — pros: visible per run / cons: an add
   that can come later.

## Decision

Adopted-as-recommended (no user judgment): option 1 is what the brief's acceptance names and keeps
ADR-369's comparability. The Claude adapter detects boundaries and summary lines and returns
path-free, text-free estimates. The core adds `compactionEstimate` per run, which is omitted when the
count is 0 and never read by groups, totals, cost, drift or baselines.

## Consequences

- Existing report fixtures stay byte-identical.
- The estimate constants are vendor-specific and live in the Claude adapter.
