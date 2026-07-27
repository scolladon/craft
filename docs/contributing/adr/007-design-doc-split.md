# 007 — Split the living architecture doc from the migration record

- **Status:** accepted
- **Date:** 2026-06-15
- **Design:** docs/DESIGN-customizable-engine.md · **Supersedes/Refines:** none

## Context

PRD §16 calls for separating the *living* engine architecture from the *historical*
workflow-promotion migration record. Today `docs/DESIGN.md` is the latter.

## Options considered

1. **Split** — `DESIGN-customizable-engine.md` becomes the living SoT; old `DESIGN.md` →
   `DESIGN-history.md` / two files. *(recommended)*
2. **Keep one merged doc** — one file / mixes the historical migration narrative with the
   evolving engine model.
3. **Fold history into a PRD appendix** — consolidates / bloats the PRD.

## Decision

`docs/DESIGN-customizable-engine.md` is the **living engine-architecture SoT**. The original
`docs/DESIGN.md` is renamed to `docs/DESIGN-history.md` (frozen migration record), executed when
P5 lands.

## Consequences

Clear separation of provenance from the evolving model; cross-references updated at P5. The
historical doc stays as frozen provenance.
