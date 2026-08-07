# 331 — Historical metrics rows are annotated, not migrated

- **Status:** accepted
- **Date:** 2026-08-06
- **Design:** docs/contributing/design/usage-miner-subagent-transcripts.md · **Supersedes/Refines:** refines ADR-119

## Context

`.claude/craft-metrics.md` holds 372 rows written under the broken accounting. The real harm
is not that they are wrong in place — it is that a reader trends across the boundary and reads
a ~100x accounting correction as a real cost explosion.

## Options considered

1. **Leave + one boundary annotation** (designer's recommendation) — pros: cheapest thing that
   prevents the actual harm; honors ADR-119 append-only / cons: old rows stay wrong in place.
2. **Migrate — recompute from surviving transcripts** — pros: one consistent file / cons: only
   partially possible (transcripts are pruned), so it silently yields a mixed-fidelity file;
   violates ADR-119 append-only.
3. **Document the break in the spec page only** — pros: zero file churn / cons: leaves the
   artifact self-contradicting for anyone who does not read the spec.

## Decision

Ratified by the user: **option 1**. One boundary marker line is appended to
`.claude/craft-metrics.md` naming the date and the correction. Rows above it are never
compared to rows below it.

## Consequences

- ADR-119's append-only property is preserved — the annotation is itself an append.
- Any future tooling that trends this ledger must respect the boundary marker.
- Migration is foreclosed: once annotated, recomputing history would produce the
  mixed-fidelity artifact option 2 was rejected for.
