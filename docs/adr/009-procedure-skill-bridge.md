# 009 — P3 procedure→skill bridge: invert the alias map in the walk

- **Status:** accepted
- **Date:** 2026-06-16
- **Design:** docs/DESIGN-P3-orchestrator-rewire.md · **Refines:** ADR-004 (alias home)

## Context

The engine's `Resolution.effective[*].procedure` is concern-named (`craft:workspace`,
`craft:validation`, …), but the skill dirs under `skills/` still carry old names (`branch/`,
`mutation/`, …) — the coordinated rename is P4. Only `design` and `review` match by name. The
P3 walk must therefore map a canonical phase `id` to the skill dir that exists *today*.

## Options considered

1. **Invert `ALIAS_MAP` in the walk** — the walk derives canonical-id→old-skill-dir from the
   published `ALIAS_MAP` (engine/src/alias-map.js); honors the DC-4 single alias home; the
   inverse table is deleted when P4 renames the dirs. *(designer recommended · user choice)*
2. **A second concern→skill table in the walk** — duplicates alias data → violates DC-4.
3. **Pull the P4 skill-dir rename forward into P3** — concern names become real dir names, no
   bridge; valid, but materially expands P3 scope and merges in the planned P4 vocabulary change.

## Decision

The walk **inverts `ALIAS_MAP`** to resolve `id → skills/<old-dir>` and invokes
`craft:<old-dir>`. No second alias table is introduced (DC-4 holds). The inverse mapping is a
throwaway expressed in the walk text, deleted at P4 when `skill dir == phase.id`.

## Consequences

The P3/P4 boundary stays clean: P3 bridges, P4 renames. The 11 SC1 phases all resolve through
the inverse without a gap (`design`/`review` map to themselves). A phase `id` with no inverse
entry and no same-named dir is a loud stop ("unknown phase id"). When P4 lands, the inverse
table and this bridge disappear in one edit.
