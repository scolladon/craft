# 187 — Inline-phase usage is a noted gap with an --include-inline opt-in

- **Status:** accepted — adopted-as-recommended (no user judgment)
- **Date:** 2026-06-28
- **Design:** docs/design/usage-telemetry-miner.md

## Context

Agent-spawned phases carry a `toolUseResult` spawn rollup with exact token/duration
sums. Inline (session-owned) phases have no spawn rollup — their cost is smeared into the
orchestrator's own accumulating context, which cannot be cleanly attributed. The brief is
explicit: "count them as a noted gap, don't fabricate."

## Decision

Adopted as the design recommended (no user judgment): inline-phase usage is a **noted gap
by default** — the report records that the phase ran without an attributable usage block,
never an invented number. An **`--include-inline`** opt-in buckets the orchestrator's
`attributionSkill`-labelled lines as an explicitly-approximate signal, clearly marked as
such in the output.

## Consequences

The default report is honest (no fabricated inline cost). Users who want the rough inline
signal opt in and get it labelled approximate. The accuracy limit (orchestrator
`cache_read` accumulates across phases) is documented, not hidden.
