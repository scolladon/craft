# 186 — Run identity keys on sessionId

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-06-28
- **Design:** docs/design/usage-telemetry-miner.md

## Context

Aggregation groups events per (run, phase/role, model). "Run" needs a stable key. The
empirical pin found `sessionId` bounds one transcript cleanly, while the feature `slug`
repeats across reruns and the same logical run can in principle span sessions.

## Decision

Adopted as the design recommended (no user judgment): a **run is keyed on `sessionId`**;
the `slug` is carried as a descriptive label, not the identity. Merging a multi-session
logical run is a documented follow-up, not built now.

## Consequences

One transcript ≈ one run, matching the data. Reruns of the same slug stay distinct.
Multi-session merge is deferred; until then a logical run split across sessions reports
as two runs (noted, not fabricated).
