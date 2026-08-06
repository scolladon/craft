# 330 — The metrics ledger row is sourced from the sub-agent transcript

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** refines ADR-119, ADR-184

## Context

`.claude/craft-metrics.md` is the second consumer of the same broken number, and the miner fix
does not reach it: ADR-119 has the *session* append each row from the usage block the spawn
returns, at run time. That block is the sub-agent's final message — the very quantity this
change proves is ~100x short. Corroborating evidence that ADR-184's writer upgrade never
fired: the ledger is 372/372 rows `cache=na`, with zero rows carrying `cache_read=`.

## Options considered

1. **Source the row from the phase's own sub-agent transcript** (designer's recommendation) —
   pros: fixes future rows; finally delivers the ADR-184 cache split / cons: no longer
   zero-cost; touches `skills/run/SKILL.md`, outside `adapters/`.
2. **Leave the writer as-is** — pros: no cost, no scope growth / cons: a known-false artifact
   keeps accruing and 372/372 `cache=na` stays unexplained.
3. **Retire per-phase rows; let the miner be the single source** — pros: cleanest end state /
   cons: drops per-phase-id granularity the miner cannot reconstruct.

## Decision

Ratified by the user: **option 1**. `skills/run/SKILL.md` instructs the session to source each
metrics row from that phase's sub-agent transcript rather than from the returned spawn usage
block.

## Consequences

- ADR-184 is amended: its stated data source is now known to be wrong, not merely cheap. Its
  "exact, zero extra cost" rationale no longer holds — the cost becomes one file read per
  phase, not the corpus scan ADR-184 rejected.
- This change edits `skills/run/SKILL.md`, deliberately outside the brief's `adapters/` line,
  authorized by this decision.
- The ledger keys rows on a finer id than the miner (`implementation-part7-mirror-sync` vs
  `phase: implementation`); that granularity is preserved.
