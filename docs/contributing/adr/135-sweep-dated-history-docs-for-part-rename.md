# 135 — Dated history docs are swept for the slice→part rename (no frozen-history carve-out)

- **Status:** accepted
- **Date:** 2026-06-22
- **Design:** docs/DESIGN-P24-rename-slice-vocabulary.md · **Supersedes/Refines:** none

## Context

craft has two precedents for how a cross-cutting rename treats point-in-time records: P4 froze
dated ADR/PLAN/DESIGN docs (old words preserved), while P8.5 swept dated docs (a user override)
because a stale plugin brand misleads. The question for P24 is which posture governs the
slice→part rename, and how to keep the rename's own meta-documents — which must *name* the old
term — from being corrupted by the sweep.

## Options considered

1. **Freeze all history** *(designer recommendation)* — pros: provenance untouched; no risk of rewriting records. Cons: leaves a divided grep (old word alive in history).
2. **Sweep everything** *(user choice)* — pros: a globally clean grep; one vocabulary across the whole tree. Cons: rewrites dated records; demands sense-aware matching to protect non-target uses.
3. **Freeze most, treat `DESIGN-customizable-engine.md` as living** — pros: narrow. Cons: that doc is a frozen program record mirroring `DESIGN-history.md`; the carve-out is unwarranted.

## Decision

Sweep all dated docs (`docs/adr/*`, `docs/{DESIGN,PLAN}-P*.md`, `DESIGN-history.md`, the
customizable-engine docs) for craft-vocabulary "slice" → "part", using word-boundary,
sense-aware matching. The user chose a globally clean grep (the P8.5 posture).

**Carve-outs (non-negotiable):** the sweep is sense-aware. Sense E (`Array.slice`,
`process.argv.slice`, the English verb) is never touched. The rename's own meta-documents — this
ADR set (131–135) and `docs/DESIGN-P24-rename-slice-vocabulary.md` — legitimately use "slice" to
*name the old term being replaced*; those naming uses are preserved. Residue closure greps the
tree and asserts every surviving "slice" is sense E or such a naming use.

## Consequences

- Dated history docs are rewritten where "slice" meant the unit/agent/gate/memory concern.
- The P24 meta-docs retain "slice" where they name what was renamed; a blanket substitution is
  forbidden.
- The documentation-phase residue grep is the proof of closure.
