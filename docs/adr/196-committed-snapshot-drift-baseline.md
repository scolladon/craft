# 196 — the drift check's baseline is a committed report.json snapshot

- **Status:** accepted
- **Date:** 2026-07-02
- **Design:** docs/DESIGN-shrink-core-prune-guardrails.md · **Supersedes/Refines:** builds on the P29 --baseline delta path

## Context

The advisory drift mode (brief concern 5) needs a stable reference for per-phase
cost/duration comparison. P29's miner already computes deltas against a `--baseline`
report; what's undecided is where the baseline lives and how it refreshes.

## Options considered

1. **Committed report.json snapshot** (recommended) — refreshed deliberately (e.g. at
   integrate) — pros: deterministic, reviewable in diff, regressions can't hide by
   moving the reference / cons: one more committed artifact to refresh.
2. **Rolling window over .claude/craft-metrics.md** — pros: zero new artifacts / cons:
   the baseline moves every run; slow regressions hide inside the window.
3. **Hand-curated baseline file** — cons: manual upkeep without compensating control.

## Decision

**Ratified by the user.** The baseline is a committed miner-report snapshot; the drift
mode feeds it to the existing --baseline delta path. Refresh is a deliberate, reviewed
act, not a side effect of running.

## Consequences

Drift is always measured against an explicitly chosen reference. The snapshot's schema is
the P29 report schema (non-goal: no rewrite); refresh cadence stays a user choice.
