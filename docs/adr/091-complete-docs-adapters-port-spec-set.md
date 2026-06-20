# 091 — Complete the docs/adapters/ port-spec set (add vcs.md + gate.md)

- **Status:** accepted
- **Date:** 2026-06-20
- **Design:** docs/DESIGN-P16-provider-agnostic.md · **Supersedes/Refines:** none

## Context
`docs/adapters/` today holds only `backlog.md` (the P11 port). P16 adds `execution.md` and
`model.md`. The Gate and VCS ports are already *extracted* (hooks + gate strings; the lifecycle
scripts, with verbs pinned in SP8) but never written up as adapter-author specs. A Pi adapter
author reuses all six ports.

## Options
1. **Also add `vcs.md` + `gate.md`** — complete the four-doc spec set the adapter author reads. pros: no prose archaeology for the next adapter, symmetry is cheap (VCS verbs already pinned in SP8) / cons: two transcription docs. *(designer's recommendation, chosen)*
2. **Write `execution.md` + `model.md` only** — pros: minimal / cons: half-documented port set; the next adapter author reverse-engineers Gate/VCS from scripts and SP8.

## Decision
P16 writes the full `docs/adapters/` set: `execution.md`, `model.md`, plus `vcs.md` and
`gate.md` transcribing the already-pinned/extracted mechanisms. `vcs.md`/`gate.md` document
existing behaviour — they introduce no new extraction and re-decide no semantics.

## Consequences
- `docs/adapters/` becomes the complete adapter-author contract surface (backlog + execution +
  model + gate + vcs).
- Each doc mirrors the `backlog.md` house shape (verbs · binding set · pre/postconditions · failure→blocker).
- `vcs.md`/`gate.md` are documentation-only; the Gate/VCS code and SP8 verbs are unchanged.
