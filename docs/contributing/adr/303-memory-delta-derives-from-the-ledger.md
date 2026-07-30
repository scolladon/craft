# 303 — The memory delta at `Done` derives from the on-disk ledger

- **Status:** accepted
- **Date:** 2026-07-30
- **Design:** docs/contributing/design/orchestrator-tax-hardening.md · **Supersedes/Refines:** refines 120 (memory save is atomic, advisory, never blocking)

## Context

`save()` at `Done` derives its delta from the run's buffered observations. Those were
buffered in session context. With the ledger on disk, there are now two candidate sources,
and a resumed run has lost the in-session buffer but still has the file.

## Options considered

1. **Derive the delta from the ledger's lines for this run-id** *(recommended)* — pros: one source of truth; reproducible after a reset / cons: the ledger's line format becomes load-bearing for memory.
2. **Keep the in-session buffer as the source; the ledger is a write-only mirror** — pros: no coupling / cons: a resumed run derives its delta from a buffer it no longer has.
3. **Buffer normally, ledger as fallback on a detected resume** — pros: both work / cons: two code paths plus a resume predicate nothing else needs.

## Decision

**Adopted-as-recommended (no user judgment).** At `Done`, the memory delta is derived from
the ledger lines carrying this run's run-id. `save` remains exactly one atomic call at
`Done` — the ledger's incremental flushing does not make the memory store incremental, and a
phase that blocks mid-run still leaves the memory store unchanged.

## Consequences

The ledger's one-record-per-line format is now depended on by the memory path, so a format
change is a breaking change for both. The buffered-flush atomicity of 120 is preserved
unweakened; the two artifacts have deliberately different flush disciplines — incremental for
the ledger, single-atomic for memory — and that asymmetry is the point, not an inconsistency.
