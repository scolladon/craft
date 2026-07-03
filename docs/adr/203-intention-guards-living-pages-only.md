# 203 — The freshness guard covers living pages only

- **Status:** accepted
- **Date:** 2026-07-03
- **Design:** docs/design/intention-port.md · **Refines:** ADR-201, ADR-202

## Context

Which parts of the intention corpus does `assert-fresh` guard for freshness? The corpus
splits into living pages (the architecture doc, port specs, DOD, GUIDE) and frozen
records (per-run design docs, ADRs, `DESIGN-history.md`, `docs/archive/`). The DOD doc
already recorded that its per-change section kept going stale because records were
re-asserted against later changes — records don't rot, living pages do.

## Options considered

1. **Living pages only; ADRs + per-run design docs stay append-only, form-guarded
   history** (recommended) — pros: records don't rot by construction, so freshness on
   them is meaningless / cons: none material.
2. **Everything including ADRs** — pros: uniform / cons: imposes supersession
   bookkeeping on an append-only record that is correct-as-history.
3. **Manifest-declared page list only** — pros: explicit / cons: no zero-config default.

## Decision

`assert-fresh` freshness/coverage applies to living pages (those carrying `subjects:`,
plus the manifest `intention.covers:` scopes). Frozen records — ADRs, per-run design
docs, `DESIGN-history.md`, `docs/archive/` — are never freshness-guarded; they remain
append-only history, form-guarded only. **Adopted as recommended (no user judgment):
the "records don't rot" principle the DOD doc itself already records.**

## Consequences

`DESIGN-history.md` stays frozen and is not the adapter's index. There is no manually
maintained index; anything index-like derives from `subjects:`.
