# 034 — Docs sweep scope: rename forge → craft in ALL docs (not the P4-precedent split)

- **Status:** accepted
- **Date:** 2026-06-17
- **Phase:** P8.5 · **Overrides:** the P4/ADR-007 precedent (dated docs kept the old name as-of-their-date)

## Context

The rename ([032](032-rename-forge-to-craft.md)) leaves ~233 `forge` references across the
`docs/` tree plus `README`/`BACKLOG`. P4 (ADR-007) set a precedent: LIVE docs reflect the new
name; DATED historical records (per-phase DESIGN/PLAN, ADRs, SPIKE, `DESIGN-history.md`) keep
the old name as correct-as-their-date. The question: follow that split, or sweep everything?

## Options considered

1. **P4-precedent split** — sweep only the living SoT (BACKLOG, README, PRD-customizable-engine,
   DESIGN-customizable-engine, PLAN-customizable-engine); leave the dated records naming `forge`,
   plus a one-line note in `DESIGN-history.md`. *(recommended)*
2. **Sweep everything** — every doc, including the dated ADRs/SPIKE/per-phase plans and
   `DESIGN-history.md`, reads `craft`. *(user choice — override)*

## Decision

**Sweep everything.** Every doc reflects `craft`; no `forge` product-name or `forge:` namespace
residue survives in `docs/`. The rename event itself stays recorded — in this ADR set
(032–036), the BACKLOG "P8.5 — rename forge→craft" block, and project memory — so the history
is not lost, it is centralized in P8.5's own records rather than scattered as stale product
names. The user accepted the tradeoff that the dated records no longer name `forge` as-of-date.

The sweep is **word-boundary, judgment-fused** (session-direct), never a blind `s/forge/craft/`:
substring collisions (`unforgettable`, `forgets`, `forget`) are mid-word and untouched by
`\bforge\b`; the literal `forge→craft` rename-narration in P8.5's own new text is preserved.

## Consequences

A reader of any pre-P8.5 dated doc sees `craft`, matching the live plugin — at the cost that
those records no longer name the plugin as it was when the decision was made. The
`DESIGN-history.md` one-line note from option 1 is unnecessary (history reads as craft; the
rename is documented here). Engine code stays 0-diff regardless (docs only).
