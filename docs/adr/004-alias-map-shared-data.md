# 004 — Phase-name alias map is shared data

- **Status:** accepted
- **Date:** 2026-06-15
- **Design:** docs/DESIGN-customizable-engine.md · **Supersedes/Refines:** none

## Context

SP4 concern-names phases; old names ship as aliases that both the lint and the orchestrator walk
must resolve identically. Two divergent copies of phase-name knowledge caused the historical
`manifest-lint` regressions.

## Options considered

1. **Shared data alias-map** consumed by both lint/resolver and walk — single source of truth /
   a tiny extra data file. *(recommended)*
2. **Hardcoded in the resolver only** — simplest / shape-lint also needs old names → drift.
3. **Per-phase `aliases:` field** — co-located with each phase / scatters the mapping across all
   13 entries.

## Decision

A single **old→new alias map (data)**, owned by the Node core (ADR-002) and consulted by both
the resolver/lint and the orchestrator walk.

## Consequences

One source of truth; the alias-resolution fixture is added to the test suite when the rename
ships (P4). If `manifest-lint` shape validation stays Bash, it reads the *same* map file — no
second copy to drift.
