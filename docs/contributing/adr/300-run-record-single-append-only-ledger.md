# 300 — The run record is a single append-only ledger file

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** refines 119 (metrics artifact kept separate from the memory store)

## Context

The run record was an in-session ledger only, so the orchestrator was the one component
craft did not protect with respawn-from-artifact: a mid-run context reset lost it entirely.
Moving it to disk needs a file shape. Two artifacts already live beside it — the memory
store and the metrics file — and 119 exists precisely to keep decaying-baseline data out of
prose-outcome data.

## Options considered

1. **Single append-only `.claude/craft-run-record.md`, one run-id-prefixed line per record** *(recommended)* — pros: mirrors the shipped metrics shape; read-back is a one-liner / cons: one file grows across runs.
2. **One file per run under `.claude/craft-runs/<run-id>.md`** — pros: reads better per run / cons: turns "the ledger" into a set; needs directory-level ignore handling.
3. **Reuse `.claude/craft-metrics.md` with a per-line prefix** — pros: no new file / cons: mixes a decaying-free metrics baseline with prose outcomes — exactly what 119 was created to prevent.

## Decision

**Adopted-as-recommended (no user judgment).** The run record is a single append-only file
at `.claude/craft-run-record.md`, one run-id-prefixed line per record, in the shape
`.claude/craft-metrics.md` already uses. It is never merged into the metrics file or the
memory store.

## Consequences

Three `.claude/` artifacts now exist with three distinct lifetimes: memory (decaying,
committed), metrics (append-only, committed), run record (append-only, run-local per 301).
Reading a prior run's outcomes is a grep on the run-id prefix.
