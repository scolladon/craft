# 337 — Sub-agent messages and duration derive from the transcript

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** none

## Context

`UsageEvent` carries `messages` and `durationMs` alongside tokens. Both previously came from
the rollup (`totalToolUseCount`, `totalDurationMs`), which ADR-328 stops reading. `durationMs`
is one of the two `drift` dimensions, so emitting zero would silently disable half the drift
signal.

## Options considered

1. **Derive from the transcript** (designer's recommendation) — `messages` = billed turns,
   `durationMs` = last−first timestamp span attributed once per transcript — pros:
   self-contained; every input pinned present (timestamps 2707/2707) / cons: a semantic shift
   from the rollup's quantities.
2. **Join the rollup by `agentId` for these two fields only** — cons: reintroduces rollup
   parsing for metadata, brings back the orphan blind spot for in-flight sub-agents, and
   reopens the double-count question for a future maintainer.
3. **Emit `0` for both** — cons: silently disables the `durationMs` drift dimension.

## Decision

**Adopted as recommended (no user judgment)** — option 1, consistent with ADR-328's rule that
rollups are never read.

## Consequences

- These are genuinely different quantities from the rollup's: measured on the reference
  sub-agent, rollup `totalToolUseCount` 74 vs 138 billed turns, and rollup `totalDurationMs`
  921,407 vs wallclock span 1,134,897.
- Cross-boundary comparison of `messages`/`durationMs` is therefore invalid, in the same way
  and for the same reason as ADR-331 and ADR-332.
