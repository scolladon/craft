# 119 — Run-over-run metrics live in a separate append-only artifact, not the learnings store

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P22-repo-local-craft-memory.md · **Supersedes/Refines:** none

## Context

Run-over-run improvement must be measurable from committed history (design Req 5), but the learnings
store decays and evicts entries (ADR-122) — a hostile home for an append-only baseline.

## Options considered

1. **Separate append-only metrics artifact** (like `docs/model-class-matrix.md`) *(designer
   recommendation)* — pros: learnings stay small/cache-like while metrics are durable history. Cons:
   a second committed file.
2. **Inside the store file** — cons: mixes decaying and historical data, fights the size cap.
3. **Run-record only (ephemeral)** — cons: loses the committed cross-run baseline (Req 5).

## Decision

*Adopted as recommended (no user judgment — aligns with the model-class-matrix precedent and Req 5).*
Run-over-run metrics (`tokens`, `duration_ms`, cache hit/miss — all harness-sourced) live in a
**separate append-only artifact** (`.claude/craft-metrics.md`); the learnings store holds no metrics.
Metrics are never decayed and are exempt from the learnings size cap (ADR-122).

## Consequences

- Two committed artifacts (store + metrics), both under the ADR-118 re-include.
- Improvement = the diff of two metrics blocks (hits↑, cached-phase cost↓).
- The size cap (ADR-122) governs only the learnings store.
